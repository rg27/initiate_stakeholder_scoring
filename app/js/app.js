/**
 * Compliance Portal - Live Controller
 */

let currentRecordId;
const IS_DEV = true; 

ZOHO.embeddedApp.on("PageLoad", async function (e) {
    ZOHO.CRM.UI.Resize({ height: "850", width: "1000" });
    await initPortal(e);
});

ZOHO.embeddedApp.init();

async function initPortal(e) {
    currentRecordId = (e && e.EntityId) ? e.EntityId[0] : (await ZOHO.CRM.INTERACTION.getPageInfo()).recordId;
    
    if (IS_DEV) {
        mockUI();
    } else {
        const record = await ZOHO.CRM.API.getRecord({ Entity: "Contacts", RecordID: currentRecordId });
        renderPortal(record.data[0]);
    }
}

function renderPortal(data) {
    // Basic Header
    document.getElementById("comp-name").textContent = data.Account_Name?.name || "Private Client";
    document.getElementById("sh-name").textContent = `${data.First_Name || ''} ${data.Last_Name || ''}`;
    document.getElementById("sh-email").textContent = data.Email || "N/A";
    document.getElementById("sh-idenfo-id").textContent = data.Idenfo_Reference_ID || "---";
    document.getElementById("link-idenfo").href = data.Idenfo_Link || "#";

    // Designations
    const tags = data.Designation ? data.Designation.split(";") : ["Shareholder"];
    document.getElementById("sh-designations").innerHTML = tags.map(t => 
        `<span class="inline-flex px-2 py-0.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded text-[9px] font-black uppercase shadow-sm">${t}</span>`
    ).join('');

    // Summary Scoring
    document.getElementById("score-cr").textContent = data.CR_Screening_Factor || "0.00";
    document.getElementById("score-br").textContent = data.BR_Total_Score || "0.00";
    document.getElementById("score-gr").textContent = data.GR_Total_Score || "0.00";
    document.getElementById("score-st-total").textContent = data.Stakeholder_Total_Score || "0.00";
    document.getElementById("score-st-rating").textContent = data.Stakeholder_Risk_Rating || "PENDING";
    
    updateFinalRiskUI(data.Final_Company_Risk_Rating || "PENDING");

    // Officer Info Section
    document.getElementById("officer-decision").textContent = data.AML_Officer_Decision || "No Decision";
    document.getElementById("officer-remark").textContent = data.AML_Office_Remarks || "No Remarks provided.";
    document.getElementById("officer-st-rating").textContent = data.Officer_Final_Stakeholder_Risk_Rating || "Not Rated";
}

function updateFinalRiskUI(rating) {
    const textEl = document.getElementById("score-final-rating");
    const cardEl = document.getElementById("final-risk-card");
    textEl.textContent = rating;
    const lowerRating = rating.toLowerCase();
    cardEl.classList.remove("bg-slate-900", "bg-green-600", "bg-red-600");
    if (lowerRating.includes("low") || lowerRating.includes("medium")) {
        cardEl.classList.add("bg-green-600");
    } else if (lowerRating.includes("high")) {
        cardEl.classList.add("bg-red-600");
    } else { cardEl.classList.add("bg-slate-900"); }
}

async function startComplianceWorkflow() {
    document.getElementById("loader-overlay").classList.replace("hidden", "flex");
    updateLog("1", "processing", "Checking Idenfo High-Risk Status...");
    await wait(1500);

    const isHighRisk = true; 
    if (isHighRisk) {
        document.getElementById("main-spinner").classList.add("hidden");
        document.getElementById("idenfo-override").classList.remove("hidden");
    } else { await runAutomatedChain(); }
}

async function confirmIdenfoOverride() {
    document.getElementById("idenfo-override").classList.add("hidden");
    document.getElementById("main-spinner").classList.remove("hidden");
    updateLog("1", "success", "Idenfo Check: Proceeded with Caution");
    await runAutomatedChain();
}

async function runAutomatedChain() {
    updateLog("upload", "processing", "Back-end AML Scan Attachment...");
    await wait(2000);
    updateLog("upload", "success", "AML Scan: Report Secured");

    updateLog("2", "processing", "Recalculating Risk Matrix...");
    await wait(2000);
    
    const newVals = { CR: "9.50", BR: "12.00", GR: "5.50", Total: "27.00", ST: "High Risk", Final: "HIGH RISK" };
    liveUpdateUI(newVals);
    
    updateLog("2", "success", "Rating: Calculation Updated");
    updateLog("3", "processing", "Awaiting Final Verdict...");
    document.getElementById("main-spinner").classList.add("hidden");
    document.getElementById("aml-decision-form").classList.remove("hidden");
}

function liveUpdateUI(vals) {
    document.getElementById("scoring-summary-box").classList.add("update-flash");
    document.getElementById("score-cr").textContent = vals.CR;
    document.getElementById("score-br").textContent = vals.BR;
    document.getElementById("score-gr").textContent = vals.GR;
    document.getElementById("score-st-total").textContent = vals.Total;
    document.getElementById("score-st-rating").textContent = vals.ST;
    updateFinalRiskUI(vals.Final);
    setTimeout(() => document.getElementById("scoring-summary-box").classList.remove("update-flash"), 2000);
}

async function submitFinalDecision() {
    const decision = document.getElementById("aml-decision-value").value;
    const rating = document.getElementById("aml-officer-rating-value").value;
    const remarks = document.getElementById("aml-remarks-value").value;
    
    if (!decision || !rating) {
        alert("Please provide both a decision and a final risk rating.");
        return;
    }

    updateLog("3", "processing", "Saving to Zoho CRM...");
    if (!IS_DEV) {
        await ZOHO.CRM.API.updateRecord({
            Entity: "Contacts",
            APIData: { 
                "id": currentRecordId, 
                "AML_Officer_Decision": decision, 
                "AML_Office_Remarks": remarks,
                "Officer_Final_Stakeholder_Risk_Rating": rating
            }
        });
    } else { await wait(1500); }
    
    updateLog("3", "success", `Success: Record Updated`);
    setTimeout(() => {
        if (!IS_DEV) ZOHO.CRM.UI.Popup.closeReload();
        else location.reload();
    }, 1500);
}

function updateLog(id, state, msg) {
    const el = document.getElementById(`step-${id}`);
    const icon = el.querySelector(".step-icon");
    if (state === "processing") {
        el.classList.add("text-slate-900", "dark:text-white");
        icon.innerHTML = `<div class="w-3 h-3 border-2 border-t-slate-900 dark:border-t-white animate-spin rounded-full"></div>`;
    } else {
        el.classList.replace("text-slate-400", "text-green-600");
        icon.classList.replace("border-slate-200", "border-green-600");
        icon.classList.add("bg-green-600", "text-white");
        icon.innerHTML = "✓";
    }
    el.querySelector(".step-text").textContent = msg;
}

function mockUI() {
    renderPortal({
        First_Name: "Jane", Last_Name: "Smith", Email: "jane@tlz.ae",
        Account_Name: { name: "Sample Venture FZCO" },
        Idenfo_Reference_ID: "REF-9921-X",
        CR_Screening_Factor: "2.10", BR_Total_Score: "5.00", GR_Total_Score: "1.00",
        Stakeholder_Total_Score: "8.10", Stakeholder_Risk_Rating: "Low",
        Final_Company_Risk_Rating: "LOW RISK",
        AML_Officer_Decision: "Accepted",
        AML_Office_Remarks: "Initial screening passed with minimal flags.",
        Officer_Final_Stakeholder_Risk_Rating: "Low Risk"
    });
    
    const others = [{ n: "Omar K.", id: "ID-552", d: "Director", r: "Medium" }];
    document.getElementById("sh-table-body").innerHTML = others.map(r => `
        <tr class="bg-slate-50 dark:bg-slate-800/40">
            <td class="p-3 font-bold">${r.n}</td>
            <td class="p-3 font-mono text-slate-500">${r.id}</td>
            <td class="p-3 italic text-slate-400">${r.d}</td>
            <td class="p-3"><span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-black">${r.r}</span></td>
        </tr>
    `).join('');
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));