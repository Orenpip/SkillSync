// Create a floating dashboard widget
const widget = document.createElement("div");
widget.id = "canvas-grade-widget";
widget.style.position = "fixed";
widget.style.bottom = "20px";
widget.style.right = "20px";
widget.style.width = "300px";
widget.style.maxHeight = "500px";
widget.style.overflowY = "auto";
widget.style.background = "white";
widget.style.border = "1px solid #ccc";
widget.style.borderRadius = "10px";
widget.style.padding = "12px";
widget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.25)";
widget.style.zIndex = "999999";
widget.style.fontFamily = "Arial, sans-serif";
widget.innerHTML = "<strong>Loading...</strong>";

// Add header with minimize/maximize button
const header = document.createElement("div");
header.style.display = "flex";
header.style.justifyContent = "space-between";
header.style.alignItems = "center";
header.style.marginBottom = "10px";
header.style.borderBottom = "2px solid #4CAF50";
header.style.paddingBottom = "8px";

const title = document.createElement("strong");
title.textContent = "Canvas Dashboard";
title.style.fontSize = "14px";
title.style.color = "#4CAF50";

const toggleBtn = document.createElement("button");
toggleBtn.textContent = "−";
toggleBtn.style.background = "#4CAF50";
toggleBtn.style.color = "white";
toggleBtn.style.border = "none";
toggleBtn.style.borderRadius = "4px";
toggleBtn.style.padding = "4px 10px";
toggleBtn.style.cursor = "pointer";
toggleBtn.style.fontSize = "16px";
toggleBtn.style.fontWeight = "bold";

const content = document.createElement("div");
content.id = "widget-content";
content.innerHTML = "<strong>Loading data...</strong>";

header.appendChild(title);
header.appendChild(toggleBtn);

widget.innerHTML = "";
widget.appendChild(header);
widget.appendChild(content);

document.body.appendChild(widget);

let isMinimized = false;
toggleBtn.addEventListener("click", () => {
  isMinimized = !isMinimized;
  if (isMinimized) {
    content.style.display = "none";
    toggleBtn.textContent = "+";
    widget.style.width = "200px";
  } else {
    content.style.display = "block";
    toggleBtn.textContent = "−";
    widget.style.width = "300px";
  }
});

async function loadDataOnPage() {
  const data = await chrome.storage.sync.get("token");
  const filesData = await chrome.storage.local.get("uploadedFiles");
  const courseData = await chrome.storage.local.get("scrapedCourseData");
  const preferencesData = await chrome.storage.local.get("userPreferences");

  if (!data.token) {
    content.innerHTML = "<strong>No API token saved.</strong><br><small>Open extension popup to set token.</small>";
    return;
  }

  const token = data.token;
  const canvasBase = "https://canvas.its.virginia.edu/api/v1";

  try {
    // Load current grades
    const courses = await fetch(
      `${canvasBase}/courses?enrollment_state=active&per_page=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json());

    content.innerHTML = "";

    // Get export status once
    const exportStatus = await chrome.storage.local.get('csvExported');

    // Top 3 Job Matches Section - only show if CSV has been exported
    if (exportStatus.csvExported) {
      const jobMatchesHeader = document.createElement("div");
      jobMatchesHeader.innerHTML = "<strong style='color: #4CAF50; font-size: 13px;'>⭐ TOP 3 MATCHES</strong>";
      jobMatchesHeader.style.marginBottom = "8px";
      content.appendChild(jobMatchesHeader);

      // Mock job matches with similarity scores, descriptions and links
      // Mock job matches with similarity scores and links (descriptions removed)
      const jobMatches = [
        {
          name: "Security Analyst Intern",
          score: 0.773,
          link: "https://app.joinhandshake.com/job-search/10426653?query=cyber&per_page=25&jobType=3&sort=relevance&page=1"
        },
        {
          name: "Software Engineer Intern",
          score: 0.7279,
          link: "https://app.joinhandshake.com/job-search/10501983?per_page=25&jobType=3&sort=relevance&page=1"
        },
        {
          name: "Intelligence Intern - Summer 2026 (Remote)",
          score: 0.7209,
          link: "https://app.joinhandshake.com/job-search/10455896?query=cyber&per_page=25&jobType=3&sort=relevance&page=1"
        }
      ];

      jobMatches.forEach(job => {
        const titleLine = document.createElement('div');
        titleLine.style.marginTop = '6px';
        titleLine.style.padding = '6px';
        titleLine.style.borderBottom = '1px solid #eee';
        titleLine.style.fontSize = '11px';
        titleLine.innerHTML = `⭐ <strong>${job.name}</strong> → ${(job.score * 100).toFixed(2)}%`;

        const link = document.createElement('a');
        link.href = job.link;
        link.target = '_blank';
        link.style.display = 'block';
        link.style.marginTop = '6px';
        link.style.fontSize = '11px';
        link.style.color = '#1976D2';
        link.textContent = job.link;

        content.appendChild(titleLine);
        content.appendChild(link);
      });
    } else {
      const noJobsDiv = document.createElement("div");
      noJobsDiv.innerHTML = "<em style='color: #999; font-size: 12px;'>Hit the GO! button to see job matches</em>";
      noJobsDiv.style.marginBottom = "15px";
      content.appendChild(noJobsDiv);
    }

    // Course Data Section
    if (courseData.scrapedCourseData) {
      const scrapedData = courseData.scrapedCourseData;
      const courseDataHeader = document.createElement("div");
      courseDataHeader.innerHTML = "<strong style='color: #4CAF50; font-size: 13px;'>📚 Course Data</strong>";
      courseDataHeader.style.marginTop = "15px";
      courseDataHeader.style.marginBottom = "8px";
      content.appendChild(courseDataHeader);

      const statsDiv = document.createElement("div");
      statsDiv.style.marginTop = "6px";
      statsDiv.style.padding = "8px";
      statsDiv.style.background = "#f5f5f5";
      statsDiv.style.borderRadius = "4px";
      statsDiv.style.fontSize = "11px";
      statsDiv.innerHTML = `
        <div><strong>${scrapedData.coursesCount}</strong> total courses</div>
        <div><strong>${scrapedData.totalCredits}</strong> total credits</div>
        <div><strong>${scrapedData.averageGrade}%</strong> average grade</div>
        <div style="color: #999; margin-top: 4px; font-size: 10px;">
          Updated: ${new Date(scrapedData.lastUpdated).toLocaleDateString()}
        </div>
      `;
      content.appendChild(statsDiv);
    }

    // Preferences Section - only show if CSV has been exported
    if (exportStatus.csvExported && preferencesData.userPreferences) {
      const prefs = preferencesData.userPreferences;
      const prefsHeader = document.createElement("div");
      prefsHeader.innerHTML = "<strong style='color: #4CAF50; font-size: 13px;'>🎯 Career Preferences</strong>";
      prefsHeader.style.marginTop = "15px";
      prefsHeader.style.marginBottom = "8px";
      content.appendChild(prefsHeader);

      const prefsDiv = document.createElement("div");
      prefsDiv.style.marginTop = "6px";
      prefsDiv.style.padding = "8px";
      prefsDiv.style.background = "#f5f5f5";
      prefsDiv.style.borderRadius = "4px";
      prefsDiv.style.fontSize = "11px";

      let prefsHTML = '';
      if (prefs.workLocation) {
        prefsHTML += `<div><strong>Location:</strong> ${capitalize(prefs.workLocation)}</div>`;
      }
      if (prefs.positionType) {
        prefsHTML += `<div><strong>Type:</strong> ${capitalize(prefs.positionType)}</div>`;
      }
      if (prefs.generalInterests && prefs.generalInterests.length > 0) {
        prefsHTML += `<div><strong>Interests:</strong> ${prefs.generalInterests.slice(0, 3).map(i => capitalize(i.replace('-', ' '))).join(', ')}${prefs.generalInterests.length > 3 ? '...' : ''}</div>`;
      }

      prefsDiv.innerHTML = prefsHTML || '<div style="color: #999;">No preferences set</div>';
      content.appendChild(prefsDiv);
    }

    // Documents Section
    const files = filesData.uploadedFiles || {};
    if (Object.keys(files).length > 0) {
      const docsHeader = document.createElement("div");
      docsHeader.innerHTML = "<strong style='color: #4CAF50; font-size: 13px;'>📁 Documents</strong>";
      docsHeader.style.marginTop = "15px";
      docsHeader.style.marginBottom = "8px";
      content.appendChild(docsHeader);

      Object.entries(files).forEach(([type, fileData]) => {
        const div = document.createElement("div");
        div.style.marginTop = "6px";
        div.style.padding = "6px";
        div.style.background = "#f5f5f5";
        div.style.borderRadius = "4px";
        div.style.fontSize = "10px";
        div.innerHTML = `
          <strong style="text-transform: uppercase; color: #4CAF50;">${type}</strong><br>
          ${fileData.name}<br>
          <span style="color: #999;">Uploaded: ${new Date(fileData.uploadDate).toLocaleDateString()}</span>
        `;
        content.appendChild(div);
      });
    }

  } catch (e) {
    content.innerHTML = "<strong>Error loading data.</strong><br><small>Check your API token in the extension.</small>";
    console.error(e);
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

loadDataOnPage();

// Reload data when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.token || changes.uploadedFiles || changes.scrapedCourseData || changes.userPreferences) {
    loadDataOnPage();
  }
});
