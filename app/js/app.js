let currentRecordId;
const IS_DEV = true; // Set to false when your Deluge function is ready

ZOHO.embeddedApp.on("PageLoad", async function (e) {
    ZOHO.CRM.UI.Resize({ height: "750", width: "1200" });
    
    // Ensure we have an ID even if PageLoad doesn't pass it immediately
    if (!e || !e.EntityId) {
        const pageInfo = await ZOHO.CRM.INTERACTION.getPageInfo();
        currentRecordId = pageInfo.recordId;
    } else {
        currentRecordId = e.EntityId[0];
    }
    
    await initPortal();
});

ZOHO.embeddedApp.init();

async function initPortal() {
    try {
        await fetchData();
        // Transition UI from loader to main portal
        setTimeout(() => {
            document.getElementById("initial-preloader").classList.add("fade-out");
            document.getElementById("main-portal").classList.replace("opacity-0", "opacity-100");
        }, 1000);
    } catch (err) {
        console.error("Initialization error:", err);
        document.getElementById("loader-status-text").textContent = "Portal Load Error";
    }
}

async function fetchData() {
    if (IS_DEV) {
        console.log("DEV MODE: Loading mock data...");
        await wait(1500); 
        mockUI();
    } else {
        const funcName = "compliance_portal_engine";
        const args = { "contactId": currentRecordId };

        console.log("[JS SDK] Calling backend function:", funcName, args);

        try {
            const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, {
                arguments: JSON.stringify(args)
            });

            if (response && response.details && response.details.output) {
                const resultData = JSON.parse(response.details.output);
                console.log("[JS SDK] Data received:", resultData);
                renderPortal(resultData);
            } else {
                throw new Error("Invalid response from function");
            }
        } catch (error) {
            console.error("Execute Function failed:", error);
            throw error; // Re-throw to catch block in initPortal
        }
    }
}

function renderPortal(data) {
    // 1. Identity & Details
    document.getElementById("sh-name").textContent = `${data.First_Name || ''} ${data.Last_Name || ''}`;
    document.getElementById("idenfo-id").textContent = data.Idenfo_ID || "NO-ID";
    document.getElementById("sh-email").textContent = data.Email || "N/A";
    document.getElementById("comp-name").textContent = data.Account_Name?.name || "Private Client";
    document.getElementById("link-idenfo").href = data.Idenfo_Link || "#";

    // 2. Timestamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById("last-update-time").textContent = `Last Update Time: ${dateStr} | ${timeStr}`;

    renderDesignations(data.Designation);
    renderFiles(data);

    // 3. Scores
    document.getElementById("score-cr").textContent = data.CR_Screening_Factor || "0.0";
    document.getElementById("score-br").textContent = data.BR_Total_Score || "0.0";
    document.getElementById("score-gr").textContent = data.GR_Total_Score || "0.0";
    document.getElementById("score-st-total").textContent = data.Stakeholder_Total_Score || "0.0";
    updateFinalRiskUI(data.Final_Company_Risk_Rating || "PENDING");
}

function renderFiles(data) {
    const docContainer = document.getElementById("document-links-container");
    docContainer.innerHTML = ""; 
    const docs = [
        { label: "Passport", id: data.Passport_File },
        { label: "AML Scan Report", id: data.AML_Scan_File }
    ];
    let count = 0;
    docs.forEach(doc => {
        if (doc.id) {
            count++;
            const link = document.createElement("a");
            link.href = `/crm/EntityAttributeView?module=Contacts&fieldDataId=${doc.id}&recordId=${currentRecordId}`;
            link.target = "_blank";
            link.className = "flex items-center p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 rounded-xl border border-slate-100 dark:border-slate-600 transition-all group";
            link.innerHTML = `
                <div class="p-2 bg-red-500/10 rounded-lg mr-3 group-hover:bg-white/20 transition-colors">
                    <svg class="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
                </div>
                <div class="flex-1">
                    <p class="text-[10px] font-black uppercase tracking-tight">${doc.label}</p>
                    <p class="text-[8px] opacity-60">Verified Document</p>
                </div>
            `;
            docContainer.appendChild(link);
        }
    });
    if (count === 0) docContainer.innerHTML = `<p class="text-[10px] italic text-slate-400 text-center py-4">No files found</p>`;
}

function updateFinalRiskUI(rating) {
    const textEl = document.getElementById("score-final-rating");
    const cardEl = document.getElementById("final-risk-card");
    textEl.textContent = rating;
    const r = rating.toLowerCase();
    cardEl.classList.remove("bg-slate-900", "bg-green-600", "bg-red-600");
    if (r.includes("low")) cardEl.classList.add("bg-green-600");
    else if (r.includes("high") || r.includes("critical")) cardEl.classList.add("bg-red-600");
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

function copyText(id) {
    const text = document.getElementById(id).innerText;
    navigator.clipboard.writeText(text);
    const el = document.getElementById(id);
    el.classList.add("text-green-500", "scale-105");
    setTimeout(() => {
        el.classList.remove("text-green-500", "scale-105");
    }, 500);
}

async function startComplianceWorkflow() {
    document.getElementById("loader-overlay").classList.replace("hidden", "flex");
    updateLog("1", "processing", "Checking Idenfo API...");
    await wait(1200);
    document.getElementById("main-spinner").classList.add("hidden");
    document.getElementById("idenfo-override").classList.remove("hidden");
}

async function confirmIdenfoOverride() {
    document.getElementById("idenfo-override").classList.add("hidden");
    document.getElementById("main-spinner").classList.remove("hidden");
    updateLog("1", "success", "Idenfo Check Complete");
    updateLog("upload", "processing", "Aggregating Scores...");
    await wait(1000);
    updateLog("upload", "success", "Scores Aggregated");
    updateLog("2", "processing", "Rating Validation...");
    await wait(800);
    updateLog("2", "success", "Rating Validated");
    updateLog("3", "processing", "Syncing CRM...");
    await wait(1000);
    updateLog("3", "success", "CRM Synced Successfully");
    await wait(800);
    document.getElementById("loader-overlay").classList.replace("flex", "hidden");
    document.getElementById("main-spinner").classList.remove("hidden");
    if (!IS_DEV) { await fetchData(); }
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

function mockUI() {
    renderPortal({
        First_Name: "Jonathan", Last_Name: "Wick", 
        Idenfo_ID: "ID-992-BX",
        Email: "j.wick@continental.ae",
        Account_Name: { name: "Continental Operations Gmbh" },
        Designation: "CEO; Board Member",
        CR_Screening_Factor: "2.1", BR_Total_Score: "6.8", GR_Total_Score: "0.9",
        Stakeholder_Total_Score: "9.8",
        Final_Company_Risk_Rating: "HIGH RISK",
        Passport_File: "FILE_999", AML_Scan_File: "FILE_888"
    });
    document.getElementById("sh-table-body").innerHTML = `
        <tr class="bg-white dark:bg-slate-800 shadow-sm">
            <td class="p-4 font-bold rounded-l-2xl">Sofia Al-Aziz</td>
            <td class="p-4 font-mono text-slate-400 text-center">ID-7721</td>
            <td class="p-4 italic">Shareholder</td>
            <td class="p-4 text-right rounded-r-2xl">
                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-xl font-black uppercase text-[9px]">Low Risk</span>
            </td>
        </tr>`;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));