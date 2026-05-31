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
    //Function Name: AML: Fetch Compliance Details_v6 
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
    } else {
        document.getElementById("last-update-time").textContent = "Last Update Time: N/A";
    }

    renderDesignations(data.cm?.cm_roles);
    renderFiles(data);

    const tableBody = document.getElementById("sh-table-body");
    tableBody.innerHTML = ""; 

    const naturalPersons = data.np_sh || [];
    const legalPersons = data.lp_sh || [];
    const combinedStakeholders = naturalPersons.concat(legalPersons);

    if (combinedStakeholders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="p-4 text-center text-slate-400 italic">
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

            const stakeholderId = person.id || "";
            const viewLink = stakeholderId ? `https://crm.zoho.com/crm/org682300086/tab/CustomModule49/${stakeholderId}` : "#";

            const row = document.createElement("tr");
            row.className = "bg-white dark:bg-slate-800 shadow-sm";

            row.innerHTML = `
                <td class="p-4 font-bold rounded-l-2xl text-slate-800 dark:text-slate-200">${displayName}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.shareholder_type || 'N/A'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.Idenfo_ID || '---'}</td>
                <td class="p-4 italic text-slate-600 dark:text-slate-400 text-left">${designationStr}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.cr_sf || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.br_ts || '0.0'}</td>
                <td class="p-4 font-mono text-slate-400 text-left">${person.gr_ts || '0.0'}</td>
                <td class="p-4 rounded-r-2xl text-center">
                    ${stakeholderId ? `<a href="${viewLink}" target="_blank" class="inline-block px-3 py-1 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black uppercase rounded-lg hover:opacity-80 transition-all shadow">View</a>` : `<span class="text-slate-400 italic text-[10px]">N/A</span>`}
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
    const clientName = data.cm?.cm_client_name || "";

    if (attachments.length === 0) {
        docContainer.innerHTML = `<span class="text-[9px] text-slate-400 italic">No attachments found.</span>`;
        return;
    }

    attachments.sort((a, b) => String(b.id || "").localeCompare(String(a.id || "")));

    const uniqueAttachments = [];
    const seenCategories = new Set();

    attachments.forEach(file => {
        const fileName = file["File_Name"] || "";
        let categoryKey = "";

        if (clientName && fileName.toLowerCase().startsWith(clientName.toLowerCase())) {
            categoryKey = `client_name_scan_${clientName.toLowerCase()}`;
        }
        else if (fileName.toLowerCase().includes("kyc form") && clientName && fileName.toLowerCase().includes(clientName.toLowerCase())) {
            categoryKey = `kyc_form_with_client_${clientName.toLowerCase()}`;
        } 
        else if (fileName.toLowerCase().includes("kyb form - nlf")) {
            categoryKey = "generic_kyb_form_nlf";
        } else if (fileName.toLowerCase().includes("kyc form")) {
            categoryKey = "generic_kyc_form";
        }

        if (categoryKey) {
            if (!seenCategories.has(categoryKey)) {
                seenCategories.add(categoryKey);
                uniqueAttachments.push(file);
            }
        } else {
            uniqueAttachments.push(file);
        }
    });

    uniqueAttachments.forEach(file => {
        const fileId = file["$file_id"];
        if (fileId) {
            const workdriveUrl = `https://workdrive.zoho.com/file/${fileId}?authId=%7B%22module%22%3A%223769920000187099442%22%2C%22entity_id%22%3A%22${currentRecordId}%22%7D`;
            const fileName = file["File_Name"] || "Unnamed Attachment";

            const link = document.createElement("a");
            link.href = workdriveUrl;
            link.target = "_blank";
            link.className = "flex items-center p-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 rounded-xl border border-slate-100 dark:border-slate-600 transition-all group";
            
            link.innerHTML = `
                <div class="p-2 bg-red-500/10 rounded-lg mr-3 group-hover:bg-white/20">
                    <svg class="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-black uppercase tracking-tight truncate">${fileName}</p>
                    <p class="text-[8px] opacity-60">WorkDrive Verified Document</p>
                </div>
            `;
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
        if (item.trim().length > 0) {
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

    // STEP 0: Run New Verification Checker
    updateLog("3", "processing", "Verifying the Idenfo Record");
    try {
        const checkerPayload = { "aml_id": currentRecordId };
        const checkerArgs = { "arguments": JSON.stringify(checkerPayload) };
        
        console.log("[JS SDK] → Calling function: last_review_checker");
        console.log("[JS SDK] → Arguments Object:", checkerPayload);
        
        const checkerRes = await ZOHO.CRM.FUNCTIONS.execute("last_review_checker", checkerArgs);
        
        console.log("[JS SDK] ← Raw execution result object:", checkerRes);

        if (checkerRes && checkerRes.details && checkerRes.details.output) {
            const checkerData = JSON.parse(checkerRes.details.output);
            const idenfoRecord = checkerData?.idenfo;
            
            if (idenfoRecord) {
                const riskRating = String(idenfoRecord.risk_rating).toLowerCase();
                const statusValue = String(idenfoRecord.status).toLowerCase();
                
                if (riskRating === "high" && statusValue === "pending") {
                    document.getElementById("loader-overlay").classList.replace("flex", "hidden");
                    
                    showCustomModal(
                        "Idenfo Record Verification Required",
                        "The Idenfo record of this client is still a High Risk and pending for approval. Please approve first from Idenfo before you trigger the Run Compliance Engine button."
                    );
                    return; 
                }
            }
        }
    } catch (e) { 
        console.error("Error in Last Review Verification Step:", e); 
    }
    updateLog("3", "success", "Review Verification Checked");

    // STEP 1: Existing Name Screening Process
    updateLog("1", "processing", "Initiate Stakeholder Screening...");
    try {
        const payload = { "cm_id": currentCmId };
        const args = { "arguments": JSON.stringify(payload) };
        console.log("DEV: AML: Trigger all Scoring Factor v4_btn (Args):", payload);
        //Function Name: DEV: AML: Trigger all Scoring Factor v4_btn 
        const res = await ZOHO.CRM.FUNCTIONS.execute("dev_aml_trigger_all_scoring_factor_v4_btn", args);
        console.log("DEV: AML: Trigger all Scoring Factor v4_btn (Result):", res);
    } catch (e) { console.error("Error Step 1:", e); }

    updateLog("1", "success", "Name Screening Complete");

    // STEP 2: Existing Final Company Risk Rating Process
    updateLog("upload", "processing", "Final Company Risk Rating...");
    try {
        const payload = { "aml_id": currentRecordId };
        const args = { "arguments": JSON.stringify(payload) };
        console.log("DEV: AML: Final Company Risk Rating (Args):", payload);
        const res = await ZOHO.CRM.FUNCTIONS.execute("dev_initiate_final_company_risk_rating_detail1", args);
        console.log("DEV: AML: Final Company Risk Rating (Result):", res);
    } catch (e) { console.error("Error Step 2:", e); }

    updateLog("upload", "success", "Risk Rating Calculated");

    // STEP 3: Existing Finalizing Sync Step
    updateLog("2", "processing", "Finalizing Sync...");
    await new Promise(r => setTimeout(r, 5000));

    document.getElementById("loader-overlay").classList.replace("flex", "hidden");

    console.log("Workflow complete. Refreshing data...");
    await fetchData(); 
}

function showCustomModal(title, message) {
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]";
    
    const container = document.createElement("div");
    container.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl transform scale-95 animate-[scaleUp_0.2s_ease-out_forwards]";
    
    container.innerHTML = `
        <div class="flex items-start gap-4 mb-4">
            <div class="p-2.5 bg-red-500/10 dark:bg-red-500/20 text-red-600 rounded-xl flex-shrink-0">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div>
                <h3 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-1">${title}</h3>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">${message}</p>
            </div>
        </div>
        <div class="flex justify-end pt-2">
            <button id="close-modal-btn" class="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase shadow-lg hover:opacity-80 active:scale-95 transition-all">
                Okay
            </button>
        </div>
    `;

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    container.querySelector("#close-modal-btn").addEventListener("click", () => {
        backdrop.classList.replace("animate-[fadeIn_0.2s_ease-out]", "animate-[fadeOut_0.15s_ease-in]");
        setTimeout(() => backdrop.remove(), 150);
    });
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

/**
 * Copies the text content of a specified HTML target element to the clipboard
 * @param {string} elementId - The DOM element ID to copy text from
 * @param {Event} event - Passed DOM Event context to handle click targets safely
 */
function copyText(elementId, event) {
    const targetElement = document.getElementById(elementId);
    if (!targetElement) return;

    const textToCopy = targetElement.textContent.trim();
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const button = event ? event.currentTarget : null;
        if (button) {
            button.classList.add("scale-110", "bg-emerald-500", "text-white");
            setTimeout(() => {
                button.classList.remove("scale-110", "bg-emerald-500", "text-white");
            }, 300);
        }
    }).catch(err => {
        console.error("Could not copy text content safely: ", err);
    });
}

/* ✅ Zoho CRM Widget Close → Refresh */
ZOHO.embeddedApp.on("PageUnload", function () {
    try {
        console.log("Widget closing → calling Popup.closeReload");

        ZOHO.CRM.UI.Popup.closeReload()
            .then(function (data) {
                console.log("Popup closeReload success:", data);
            })
            .catch(function (err) {
                console.error("Popup closeReload failed:", err);
            });

    } catch (e) {
        console.error("PageUnload error:", e);
    }
});