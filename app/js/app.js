let currentRecordId;
const IS_DEV = false; // Set to false when your Deluge function is ready

ZOHO.embeddedApp.on("PageLoad", async function (entity) {
    ZOHO.CRM.UI.Resize({ height: "750", width: "1200" });
    currentRecordId = entity.EntityId[0];
    await initPortal();
});

ZOHO.embeddedApp.init();

async function initPortal() {
    try {
        await fetchData();
        setTimeout(() => {
            document.getElementById("initial-preloader").classList.add("fade-out");
            document.getElementById("main-portal").classList.replace("opacity-0", "opacity-100");
        }, 1000);
    } catch (err) {
        console.error("Initialization error:", err);
        document.getElementById("loader-status-text").textContent = "Portal Load Error";
        setTimeout(() => {
            document.getElementById("initial-preloader").classList.add("fade-out");
            document.getElementById("main-portal").classList.replace("opacity-0", "opacity-100");
        }, 1000);
    }
}

async function fetchData() {
    if (IS_DEV) {
        console.log("DEV MODE: Loading mock data...");
        await wait(1500); 
        mockUI();
    } else {
        const funcName = "aml_fetch_compliance_details_v6";
        const payload = { "aml_id": currentRecordId };
        const args = { "arguments": JSON.stringify(payload) };

        console.log("[JS SDK] → Calling function:", funcName);
        console.log("[JS SDK] → Arguments:", JSON.stringify(payload));
        console.time("[JS SDK] execute duration");

        try {
            const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, args);
            console.timeEnd("[JS SDK] execute duration");
            console.log("[JS SDK] ← Raw response object:", response);

            if (response && response.details && response.details.output) {
                const resultData = JSON.parse(response.details.output);
                console.log("[JS SDK] ← Parsed output data:", resultData);
                renderPortal(resultData);
            } else {
                console.warn("[JS SDK] ✗ Unexpected response structure:", response);
                throw new Error("Invalid response from function");
            }
        } catch (error) {
            console.error("[JS SDK] ✗ Execute failed:", error);
            throw error;
        }
    }
}

function renderPortal(data) {
    // Store globally for workflow use
    window.lastFetchedData = data;

    // 1. Identity & Details
    document.getElementById("sh-name").textContent = data.cm?.cm_client_name || "N/A";
    document.getElementById("idenfo-id").textContent = data.cm?.cm_idenfo_id || "N/A";
    document.getElementById("sh-email").textContent = data.cm?.cm_client_email || "N/A";
    document.getElementById("comp-name").textContent = data.cm?.cm_account_name || "N/A";
    document.getElementById("link-idenfo").href = data.cm?.cm_idenfo_id 
        ? `https://uaedirect.idenfo.com/customer-profiles/customer-information/${data.cm.cm_idenfo_url}` 
        : "#";

    // 2. Timestamp
    const modTimeStr = data.cm?.cm_modified_time;
    if (modTimeStr) {
        const dateObj = new Date(modTimeStr);
        const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        document.getElementById("last-update-time").textContent = `Last Update Time: ${dateStr} | ${timeStr}`;
    } else {
        document.getElementById("last-update-time").textContent = "Last Update Time: N/A";
    }

    renderDesignations(data.cm?.cm_roles);
    renderFiles(data);

    // 3. Merging & Processing Stakeholder Tables
    const tableBody = document.getElementById("sh-table-body");
    tableBody.innerHTML = ""; 

    const naturalPersons = data.np_sh || [];
    const legalPersons = data.lp_sh || [];
    const combinedStakeholders = naturalPersons.concat(legalPersons);

    if (combinedStakeholders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="p-4 text-center text-slate-400 italic">
                    No other stakeholders linked to this company.
                </td>
            </tr>`;
    } else {
        combinedStakeholders.forEach(person => {
            let displayName = person.shareholder_type === "Natural Person" 
                ? (person.np_fname + " " + person.np_lname).trim() || "Unknown Individual"
                : person.company_brand_name || "Unknown Company";

            const designationStr = Array.isArray(person.member_roles) 
                ? person.member_roles.join("; ") 
                : (person.member_roles || "N/A");

            const row = document.createElement("tr");
            row.className = "bg-white dark:bg-slate-800 shadow-sm";
            row.innerHTML = `
                <td class="p-4 font-bold rounded-l-2xl text-slate-800 dark:text-slate-200">${displayName}</td>
                <td class="p-4 font-mono text-slate-400 text-center">${person.shareholder_type || 'N/A'}</td>
                <td class="p-4 font-mono text-slate-400 text-center">${person.Idenfo_ID || '---'}</td>
                <td class="p-4 italic text-slate-600 dark:text-slate-400">${designationStr}</td>
                <td class="p-4 font-mono text-slate-400 text-center">${person.cr_sf || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-center">${person.br_ts || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-center">${person.gr_ts || '0.0'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // 4. Scores
    document.getElementById("score-cr").textContent = data.aml?.aml_cr_screening_factor ?? "0.0";
    document.getElementById("score-br").textContent = data.aml?.aml_br_total_score ?? "0.0";
    document.getElementById("score-gr").textContent = data.aml?.aml_gr_total_score ?? "0.0";
    document.getElementById("score-st-total").textContent = data.aml?.aml_stakeholder_total_score ?? "0.0";
    updateFinalRiskUI(data.aml?.aml_final_company_risk_rating || "PENDING");
    document.getElementById("score-st-rating").textContent = data.aml?.aml_stakeholder_risk_rating ?? "N/A";
}

function renderFiles(data) {
    const docContainer = document.getElementById("document-links-container");
    docContainer.innerHTML = ""; 
    const docs = [
        { label: "Passport", id: data.Passport_File },
        { label: "AML Scan Report", id: data.AML_Scan_File }
    ];
    docs.forEach(doc => {
        if (doc.id) {
            const link = document.createElement("a");
            link.href = `/crm/EntityAttributeView?module=AML_Compliances&fieldDataId=${doc.id}&recordId=${currentRecordId}`;
            link.target = "_blank";
            link.className = "flex items-center p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 rounded-xl border border-slate-100 dark:border-slate-600 transition-all group";
            link.innerHTML = `<div class="p-2 bg-red-500/10 rounded-lg mr-3 group-hover:bg-white/20"><svg class="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg></div><div class="flex-1"><p class="text-[10px] font-black uppercase tracking-tight">${doc.label}</p><p class="text-[8px] opacity-60">Verified Document</p></div>`;
            docContainer.appendChild(link);
        }
    });
}

function updateFinalRiskUI(rating) {
    const textEl = document.getElementById("score-final-rating");
    const cardEl = document.getElementById("final-risk-card");
    textEl.textContent = rating;
    cardEl.classList.remove("bg-slate-900", "bg-green-600", "bg-red-600");
    if (rating.toLowerCase().includes("low")) cardEl.classList.add("bg-green-600");
    else if (rating.toLowerCase().includes("high") || rating.toLowerCase().includes("critical")) cardEl.classList.add("bg-red-600");
    else cardEl.classList.add("bg-slate-900");
}

function renderDesignations(designations) {
    const container = document.getElementById("sh-designations");
    container.innerHTML = "";
    if (!designations) return;
    const list = Array.isArray(designations) ? designations : designations.split(";");
    list.forEach(item => {
        if(item.trim().length > 0) {
            const span = document.createElement("span");
            span.className = "px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded font-black uppercase text-[7px] border border-slate-200 dark:border-slate-600 inline-block align-middle";
            span.textContent = item.trim();
            container.appendChild(span);
        }
    });
}

async function startComplianceWorkflow() {
    document.getElementById("loader-overlay").classList.replace("hidden", "flex");
    const currentCmId = window.lastFetchedData?.cm?.cm_id;

    // Step 1: Uses cm_id
    updateLog("1", "processing", "Initiate Stakeholder Screening...");
    if (!IS_DEV) {
        try {
            const payload = { "cm_id": currentCmId };
            const args = { "arguments": JSON.stringify(payload) };
            console.log("DEV: AML: Trigger all Scoring Factor v4_btn (Args):", payload);
            const res = await ZOHO.CRM.FUNCTIONS.execute("dev_aml_trigger_all_scoring_factor_v4_btn", args);
            console.log("DEV: AML: Trigger all Scoring Factor v4_btn (Result):", res);
        } catch (e) { console.error("Error Step 1:", e); }
    } else { await wait(1200); }
    updateLog("1", "success", "Name Screening Complete");
    
    // Step 2: Uses aml_id (currentRecordId)
    updateLog("upload", "processing", "Final Company Risk Rating...");
    if (!IS_DEV) {
        try {
            const payload = { "aml_id": currentRecordId };
            const args = { "arguments": JSON.stringify(payload) };
            console.log("DEV: AML: Final Company Risk Rating (Args):", payload);
            const res = await ZOHO.CRM.FUNCTIONS.execute("dev_initiate_final_company_risk_rating_detail1", args);
            console.log("DEV: AML: Final Company Risk Rating (Result):", res);
        } catch (e) { console.error("Error Step 2:", e); }
    } else { await wait(1200); }
    updateLog("upload", "success", "Risk Rating Calculated");
    
    // Finalize
    updateLog("2", "processing", "Finalizing Sync...");
    await wait(5000); // 5 seconds wait
    
    document.getElementById("loader-overlay").classList.replace("flex", "hidden");
    
    if (!IS_DEV) { 
        console.log("Workflow complete. Refreshing data...");
        await fetchData(); 
    }
}

function updateLog(id, state, msg) {
    const el = document.getElementById(`step-${id}`);
    if (!el) return;
    const icon = el.querySelector(".step-icon");
    if (state === "processing") {
        el.classList.add("text-slate-900", "dark:text-white");
        icon.innerHTML = `<div class="w-3 h-3 border-2 border-t-slate-900 animate-spin rounded-full"></div>`;
    } else {
        el.classList.replace("text-slate-400", "text-green-600");
        icon.classList.add("bg-green-600", "text-white", "border-green-600");
        icon.innerHTML = "✓";
    }
    el.querySelector(".step-text").textContent = msg;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));