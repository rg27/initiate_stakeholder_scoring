let currentRecordId;

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
    const funcName = "aml_fetch_compliance_details_v6";
    const payload = { "aml_id": currentRecordId };
    const args = { "arguments": JSON.stringify(payload) };

    try {
        const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, args);
        if (response && response.details && response.details.output) {
            const resultData = JSON.parse(response.details.output);
            renderPortal(resultData);
        } else {
            throw new Error("Invalid response from function");
        }
    } catch (error) {
        console.error("[JS SDK] ✗ Execute failed:", error);
        throw error;
    }
}

function renderPortal(data) {
    window.lastFetchedData = data;
    document.getElementById("sh-name").textContent = data.cm?.cm_client_name || "N/A";
    document.getElementById("idenfo-id").textContent = data.cm?.cm_idenfo_id || "N/A";
    document.getElementById("sh-email").textContent = data.cm?.cm_client_email || "N/A";
    document.getElementById("comp-name").textContent = data.cm?.cm_account_name || "N/A";
    document.getElementById("link-idenfo").href = data.cm?.cm_idenfo_id 
        ? `https://uaedirect.idenfo.com/customer-profiles/customer-information/${data.cm.cm_idenfo_url}` 
        : "#";

    const modTimeStr = data.cm?.cm_modified_time;
    if (modTimeStr) {
        const dateObj = new Date(modTimeStr);
        const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        document.getElementById("last-update-time").textContent = `Last Update Time: ${dateStr} | ${timeStr}`;
    }

    renderDesignations(data.cm?.cm_roles);
    renderFiles(data);

    const tableBody = document.getElementById("sh-table-body");
    tableBody.innerHTML = ""; 
    const combinedStakeholders = (data.np_sh || []).concat(data.lp_sh || []);

    if (combinedStakeholders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-400 italic">No other stakeholders linked.</td></tr>`;
    } else {
        combinedStakeholders.forEach(person => {
            let displayName = person.shareholder_type === "Natural Person" 
                ? (person.np_fname + " " + person.np_lname).trim() 
                : person.company_brand_name || "Unknown Company";

            const row = document.createElement("tr");
            row.className = "bg-white dark:bg-slate-800 shadow-sm";
            row.innerHTML = `
                <td class="p-4 font-bold rounded-l-2xl text-slate-800 dark:text-slate-200">${displayName}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.shareholder_type || 'N/A'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.Idenfo_ID || '---'}</td>
                <td class="p-4 italic text-slate-600 dark:text-slate-400 text-left">${person.member_roles || "N/A"}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.cr_sf || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.br_ts || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.gr_ts || '0.0'}</td>
                <td class="p-4 rounded-r-2xl text-center">
                    ${person.id ? `<a href="https://crm.zoho.com/crm/org682300086/tab/CustomModule49/${person.id}" target="_blank" class="inline-block px-3 py-1 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black uppercase rounded-lg hover:opacity-80 transition-all shadow">View</a>` : ""}
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    document.getElementById("score-cr").textContent = data.aml?.aml_cr_screening_factor ?? "0.0";
    document.getElementById("score-br").textContent = data.aml?.aml_br_total_score ?? "0.0";
    document.getElementById("score-gr").textContent = data.aml?.aml_gr_total_score ?? "0.0";
    document.getElementById("score-st-total").textContent = data.aml?.aml_stakeholder_total_score ?? "0.0";
    document.getElementById("sh-shareholder-type").textContent = data.aml?.aml_record_type || "N/A";
    updateFinalRiskUI(data.aml?.aml_final_company_risk_rating || "PENDING");
    document.getElementById("score-st-rating").textContent = data.aml?.aml_stakeholder_risk_rating ?? "N/A";
}

function renderFiles(data) {
    const docContainer = document.getElementById("document-links-container");
    docContainer.innerHTML = ""; 
    let attachments = data.aml_attachments || [];

    if (attachments.length === 0) {
        docContainer.innerHTML = `<span class="text-[9px] text-slate-400 italic">No attachments found.</span>`;
        return;
    }

    attachments.sort((a, b) => new Date(b.Created_Time) - new Date(a.Created_Time));

    const uniqueAttachments = [];
    const seenGroups = new Set();

    attachments.forEach(file => {
        const fileName = (file["File_Name"] || "").toLowerCase();
        let groupKey = fileName;
        
        if (fileName.includes(" - ")) {
            const parts = fileName.split(" - ");
            if (parts.length > 1 && (parts[parts.length - 1].includes(".pdf") || parts[parts.length - 1].includes("pm") || parts[parts.length - 1].includes("am"))) {
                groupKey = parts[0].trim();
            }
        }

        if (!seenGroups.has(groupKey)) {
            uniqueAttachments.push(file);
            seenGroups.add(groupKey);
        }
    });

    uniqueAttachments.forEach(file => {
        if (file["$file_id"]) {
            const link = document.createElement("a");
            link.href = `https://workdrive.zoho.com/file/${file["$file_id"]}?authId=%7B%22module%22%3A%223769920000187099442%22%2C%22entity_id%22%3A%22${currentRecordId}%22%7D`;
            link.target = "_blank";
            link.className = "flex items-center p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-900 rounded-xl border transition-all group";
            link.innerHTML = `<div class="p-2 bg-red-500/10 rounded-lg mr-3"><svg class="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg></div><p class="text-[10px] font-black uppercase truncate group-hover:text-white">${file["File_Name"] || "Attachment"}</p>`;
            docContainer.appendChild(link);
        }
    });
}

async function startComplianceWorkflow() {
    resetLog();
    document.getElementById("loader-overlay").classList.replace("hidden", "flex");
    const currentCmId = window.lastFetchedData?.cm?.cm_id;
    updateLog("3", "processing", "Verifying the Idenfo Record");
    try {
        const checkerRes = await ZOHO.CRM.FUNCTIONS.execute("last_review_checker", { "arguments": JSON.stringify({ "aml_id": currentRecordId }) });
        const data = JSON.parse(checkerRes.details.output);
        if (data?.idenfo?.risk_rating === "high" && data?.idenfo?.status === "pending") {
            showCustomAlert("Action Required", "The client's Idenfo risk rating is currently marked as High and remains pending for approval. Kindly review and approve the Idenfo record at your earliest convenience.");
            return;
        }
        await ZOHO.CRM.FUNCTIONS.execute("aml_set_cr_screening_factor_v2", { "arguments": JSON.stringify({ "aml_id": currentRecordId }) });
        updateLog("3", "success", "Review Verification Checked");
    } catch (e) { showBackendErrorModal(); return; }

    updateLog("download", "processing", "Downloading AML Scan Report...");
    try {
        await ZOHO.CRM.FUNCTIONS.execute("aml_download_newly_approved_aml_scan_report_v2", { "arguments": JSON.stringify({ "aml_id": currentRecordId }) });
        updateLog("download", "success", "Report Downloaded");
    } catch (e) { showBackendErrorModal(); return; }

    updateLog("1", "processing", "Initiate Stakeholder Screening...");
    try {
        await ZOHO.CRM.FUNCTIONS.execute("dev_aml_trigger_all_scoring_factor_v4_btn", { "arguments": JSON.stringify({ "cm_id": currentCmId }) });
        updateLog("1", "success", "Name Screening Complete");
    } catch (e) { showBackendErrorModal(); return; }

    updateLog("upload", "processing", "Final Company Risk Rating...");
    try {
        await ZOHO.CRM.FUNCTIONS.execute("dev_initiate_final_company_risk_rating_detail1", { "arguments": JSON.stringify({ "aml_id": currentRecordId }) });
        updateLog("upload", "success", "Risk Rating Calculated");
    } catch (e) { showBackendErrorModal(); return; }

    updateLog("2", "processing", "Finalizing Sync...");
    await new Promise(r => setTimeout(r, 2000));
    await fetchData();
    updateLog("2", "success", "Sync Complete");
    document.getElementById("loader-overlay").classList.replace("flex", "hidden");
}

function resetLog() {
    document.querySelectorAll('[id^="step-"]').forEach(el => {
        el.classList.replace("text-green-600", "text-slate-400");
        const icon = el.querySelector(".step-icon");
        if(icon) icon.classList.remove("bg-green-600", "text-white", "border-green-600");
    });
}

function updateLog(id, state, msg) {
    const el = document.getElementById(`step-${id}`);
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

function updateFinalRiskUI(rating) {
    const cardEl = document.getElementById("final-risk-card");
    document.getElementById("score-final-rating").textContent = rating;
    cardEl.className = "p-3 rounded-2xl shadow-xl flex flex-col justify-center items-center text-center";
    if (rating.toLowerCase().includes("low")) cardEl.classList.add("bg-green-600");
    else if (rating.toLowerCase().includes("high")) cardEl.classList.add("bg-red-600");
    else cardEl.classList.add("bg-slate-900");
}

function renderDesignations(designations) {
    const container = document.getElementById("sh-designations");
    container.innerHTML = "";
    if (!designations) return;
    const list = Array.isArray(designations) ? designations : designations.split(";");
    list.forEach(item => {
        if (item.trim()) {
            const span = document.createElement("span");
            span.className = "px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-black uppercase text-[7px]";
            span.textContent = item.trim();
            container.appendChild(span);
        }
    });
}

function showBackendErrorModal() {
    showCustomAlert("Error", "Backend process failed. Please contact support.");
    document.getElementById("loader-overlay").classList.replace("flex", "hidden");
}

function showCustomAlert(title, message) {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-6";
    overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center border border-slate-700">
            <h3 class="text-lg font-black text-slate-900 dark:text-white mb-2">${title}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">${message}</p>
            <button onclick="this.parentElement.parentElement.remove(); document.getElementById('loader-overlay').classList.replace('flex', 'hidden');" class="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase">Okay</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function copyText(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text);
}

function closeAndReload() {
    ZOHO.CRM.UI.Popup.closeReload();
}