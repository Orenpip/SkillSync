// ===== TAB NAVIGATION =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data for specific tabs
    if (tabName === 'uploads') {
      loadUploadedFiles();
    } else if (tabName === 'preferences') {
      loadPreferences();
    }
  });
});

// ===== GRADES TAB =====
document.getElementById("saveToken").onclick = async () => {
  const t = document.getElementById("token").value;
  if (!t) {
    alert("Please enter a token!");
    return;
  }
  await chrome.storage.sync.set({ token: t });
  alert("Token saved!");
  loadGrades();
};

async function loadGrades() {
  const data = await chrome.storage.sync.get("token");
  const container = document.getElementById("grades");

  if (!data.token) {
    container.innerHTML = "<p>No token saved.</p>";
    return;
  }

  const token = data.token;
  const canvasBase = "https://canvas.its.virginia.edu/api/v1";

  try {
    const courses = await fetch(
      `${canvasBase}/courses?enrollment_state=active&per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    ).then(r => r.json());

    container.innerHTML = "";

    if (courses.length === 0) {
      container.innerHTML = "<p>No active courses found.</p>";
      return;
    }

    courses.forEach(course => {
      const grade = course.enrollments?.[0]?.computed_current_score ?? "N/A";

      const div = document.createElement("div");
      div.className = "course";
      div.innerHTML = `<strong>${course.name}</strong><br>Grade: ${grade}`;
      container.appendChild(div);
    });
  } catch (error) {
    container.innerHTML = "<p>Error loading grades. Check your token.</p>";
    console.error(error);
  }
}

loadGrades();

// ===== COURSE DATA SCRAPING =====
document.getElementById("scrapeCourses").addEventListener('click', async () => {
  const scrapeButton = document.getElementById("scrapeCourses");
  const statusMessage = document.getElementById("scrapeStatus");
  const dataSummary = document.getElementById("courseDataSummary");
  
  scrapeButton.disabled = true;
  scrapeButton.textContent = "⏳ Scraping...";
  
  statusMessage.className = "status-message loading show";
  statusMessage.textContent = "Fetching course data from Canvas...";
  
  dataSummary.classList.remove('show');

  try {
    const courseData = await scrapeAllCourses();
    
    // Save to storage
    await chrome.storage.local.set({ scrapedCourseData: courseData });
    
    // Show success
    statusMessage.className = "status-message success show";
    statusMessage.textContent = `✓ Successfully scraped ${courseData.courses.length} courses!`;
    
    // Show summary
    dataSummary.innerHTML = `
      <div><span class="course-count">${courseData.courses.length}</span> <strong>courses scraped</strong></div>
      <div class="data-item">
        <strong>Total Credits:</strong> ${courseData.totalCredits || 'N/A'}
      </div>
      <div class="data-item">
        <strong>Average Grade:</strong> ${courseData.averageGrade || 'N/A'}%
      </div>
      <div class="data-item">
        <strong>Last Updated:</strong> ${new Date(courseData.lastUpdated).toLocaleString()}
      </div>
    `;
    dataSummary.classList.add('show');
    
    // Show export buttons
    document.getElementById('exportButtons').style.display = 'flex';
    
    scrapeButton.textContent = "✓ Course Data Scraped";
    
    setTimeout(() => {
      scrapeButton.disabled = false;
      scrapeButton.textContent = "📚 Scrape Course Data";
    }, 3000);
    
  } catch (error) {
    console.error('Scraping error:', error);
    statusMessage.className = "status-message error show";
    statusMessage.textContent = "✗ Error scraping courses: " + error.message;
    
    scrapeButton.disabled = false;
    scrapeButton.textContent = "📚 Scrape Course Data";
  }
});

async function scrapeAllCourses() {
  const data = await chrome.storage.sync.get("token");
  
  if (!data.token) {
    throw new Error("No API token found. Please save your token first.");
  }

  const token = data.token;
  const canvasBase = "https://canvas.its.virginia.edu/api/v1";
  
  // Fetch all courses (past and present)
  const coursesResponse = await fetch(
    `${canvasBase}/courses?per_page=100&include[]=total_students&include[]=teachers&include[]=term&include[]=course_image`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  
  if (!coursesResponse.ok) {
    throw new Error("Failed to fetch courses from Canvas");
  }
  
  const allCourses = await coursesResponse.json();
  
  // Filter out courses without enrollments (not student courses)
  const studentCourses = allCourses.filter(course => 
    course.enrollments && course.enrollments.length > 0
  );
  
  const courseData = [];
  let totalCredits = 0;
  let totalGrades = 0;
  let gradeCount = 0;
  
  // Fetch detailed information for each course
  for (const course of studentCourses) {
    try {
      // Get course details
      const courseDetailResponse = await fetch(
        `${canvasBase}/courses/${course.id}?include[]=syllabus_body&include[]=term`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      const courseDetail = await courseDetailResponse.json();
      
      // Get assignments for credit calculation
      const assignmentsResponse = await fetch(
        `${canvasBase}/courses/${course.id}/assignments?per_page=100`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      const assignments = await assignmentsResponse.json();
      
      // Extract grade
      const grade = course.enrollments?.[0]?.computed_current_score;
      const finalGrade = course.enrollments?.[0]?.computed_final_score;
      const letterGrade = course.enrollments?.[0]?.computed_current_grade;
      
      if (grade !== null && grade !== undefined) {
        totalGrades += grade;
        gradeCount++;
      }
      
      // Use a fixed course description text (override any scraped description)
      const description = "This course provides a manager’s view of cybersecurity and privacy.  The content of the course gives a broad overview of essential concepts and methods for providing and evaluating security for organizations. This course includes an emphasis on applying analytics to understand cybersecurity threats.  In addition, the course touches on the importance of management and administration, the place information security holds in overall business risk, risk presented by the rise of the IoT, social issues such as individual privacy, and the role of public policy.";
      
      // Count credits (approximate from course code if available)
      const courseCode = course.course_code || '';
      const creditMatch = courseCode.match(/(\d+)\s*credits?/i);
      const credits = creditMatch ? parseInt(creditMatch[1]) : 3; // Default to 3 credits
      
      totalCredits += credits;
      
      // Attempt to find and extract text from a PDF linked in the syllabus body
      let syllabusText = null;
      try {
        if (courseDetail.syllabus_body) {
          const tmp = document.createElement('div');
          tmp.innerHTML = courseDetail.syllabus_body;
          const anchors = Array.from(tmp.querySelectorAll('a'));
          for (const a of anchors) {
            let href = a.getAttribute('href') || a.href;
            if (!href) continue;
            // Normalize relative URLs
            let url = href;
            if (url.startsWith('/')) url = `${canvasBase}${url}`;
            if (url.startsWith('//')) url = window.location.protocol + url;

            try {
              const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
              if (!resp.ok) continue;
              const contentType = (resp.headers.get('content-type') || '').toLowerCase();
              const buffer = await resp.arrayBuffer();
              if (contentType.includes('pdf') || href.toLowerCase().endsWith('.pdf') || isPdfArrayBuffer(buffer)) {
                const blob = new Blob([buffer], { type: 'application/pdf' });
                try {
                  const text = await fileToText(blob);
                  if (text && text.length > 30) {
                    syllabusText = text;
                    break;
                  }
                } catch (e) {
                  console.warn('Failed to extract syllabus PDF text for course', course.id, e);
                }
              }
            } catch (e) {
              // ignore and try next link
              continue;
            }
          }
        }
      } catch (e) {
        console.warn('Syllabus extraction parsing error for course', course.id, e);
      }
      
      courseData.push({
        id: course.id,
        name: course.name,
        courseCode: course.course_code,
        description: description,
        // syllabusText: extracted plain-text from syllabus PDF when available
        syllabusText: syllabusText,
        grade: grade,
        finalGrade: finalGrade,
        letterGrade: letterGrade,
        credits: credits,
        term: courseDetail.term?.name || course.term?.name || 'Unknown',
        startDate: course.start_at,
        endDate: course.end_at,
        enrollmentState: course.enrollment_state || course.workflow_state,
        assignmentCount: assignments.length || 0,
        teachers: course.teachers?.map(t => t.display_name).join(', ') || 'N/A'
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error fetching details for course ${course.id}:`, error);
      // Still add basic course info even if detailed fetch fails
      courseData.push({
        id: course.id,
        name: course.name,
        courseCode: course.course_code,
        description: "This course provides a manager’s view of cybersecurity and privacy.  The content of the course gives a broad overview of essential concepts and methods for providing and evaluating security for organizations. This course includes an emphasis on applying analytics to understand cybersecurity threats.  In addition, the course touches on the importance of management and administration, the place information security holds in overall business risk, risk presented by the rise of the IoT, social issues such as individual privacy, and the role of public policy.",
        grade: course.enrollments?.[0]?.computed_current_score,
        term: course.term?.name || 'Unknown',
        enrollmentState: course.enrollment_state
      });
    }
  }
  
  const averageGrade = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(2) : null;
  
  return {
    courses: courseData,
    totalCredits: totalCredits,
    averageGrade: averageGrade,
    lastUpdated: new Date().toISOString(),
    coursesCount: courseData.length
  };
}

// Helper to check if an ArrayBuffer is a PDF by header bytes
function isPdfArrayBuffer(buf) {
  try {
    const bytes = new Uint8Array(buf);
    return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // '%PDF'
  } catch (e) {
    return false;
  }
}

function stripHTML(html) {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// ===== PREFERENCES TAB =====
async function loadPreferences() {
  const data = await chrome.storage.local.get('userPreferences');
  const prefs = data.userPreferences || {};
  
  // Load LinkedIn credentials
  if (prefs.linkedinEmail) {
    document.getElementById('linkedinEmail').value = prefs.linkedinEmail;
  }
  if (prefs.linkedinPassword) {
    document.getElementById('linkedinPassword').value = prefs.linkedinPassword;
  }
  
  // Load job search fields
  if (prefs.jobKeywords) {
    document.getElementById('jobKeywords').value = prefs.jobKeywords;
  }
  if (prefs.jobLocation) {
    document.getElementById('jobLocation').value = prefs.jobLocation;
  }
  
  // Load dropdowns
  if (prefs.workLocation) {
    document.getElementById('workLocation').value = prefs.workLocation;
  }
  if (prefs.positionType) {
    document.getElementById('positionType').value = prefs.positionType;
  }
  
  // Load interests checkboxes
  if (prefs.generalInterests && Array.isArray(prefs.generalInterests)) {
    prefs.generalInterests.forEach(interest => {
      const checkbox = document.querySelector(`input[value="${interest}"]`);
      if (checkbox) checkbox.checked = true;
    });
  }
  
  // Load industries checkboxes
  if (prefs.preferredIndustries && Array.isArray(prefs.preferredIndustries)) {
    prefs.preferredIndustries.forEach(industry => {
      const checkbox = document.querySelector(`input[value="${industry}"]`);
      if (checkbox) checkbox.checked = true;
    });
  }
  
  // Load custom interests
  if (prefs.customInterests) {
    document.getElementById('customInterests').value = prefs.customInterests;
  }
}

document.getElementById('savePreferences').addEventListener('click', async () => {
  const saveButton = document.getElementById('savePreferences');
  const successMessage = document.getElementById('preferencesSuccess');
  
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  
  // Collect preferences
  const preferences = {
    linkedinEmail: document.getElementById('linkedinEmail').value,
    linkedinPassword: document.getElementById('linkedinPassword').value,
    jobKeywords: document.getElementById('jobKeywords').value,
    jobLocation: document.getElementById('jobLocation').value,
    workLocation: document.getElementById('workLocation').value,
    positionType: document.getElementById('positionType').value,
    generalInterests: [],
    preferredIndustries: [],
    customInterests: document.getElementById('customInterests').value,
    lastUpdated: new Date().toISOString()
  };
  
  // Collect checked interests
  document.querySelectorAll('.interest-item input[type="checkbox"]:checked').forEach(checkbox => {
    const value = checkbox.value;
    const parent = checkbox.closest('.preference-section');
    const label = parent.querySelector('label').textContent;
    
    if (label.includes('Interests')) {
      preferences.generalInterests.push(value);
    } else if (label.includes('Industries')) {
      preferences.preferredIndustries.push(value);
    }
  });
  
  // Save to storage
  await chrome.storage.local.set({ userPreferences: preferences });
  
  // Show success
  successMessage.classList.add('show');
  saveButton.textContent = '✓ Saved';
  
  setTimeout(() => {
    successMessage.classList.remove('show');
    saveButton.disabled = false;
    saveButton.textContent = 'Save Preferences';
  }, 2000);
});

// ===== FILE UPLOAD TAB =====
class FileUploadManager {
  constructor() {
    this.resumeFile = null;
    this.transcriptFile = null;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.allowedExtensions = ['pdf', 'doc', 'docx'];
    
    this.init();
  }

  init() {
    this.setupFileInput('resume');
    this.setupFileInput('transcript');
    
    document.getElementById('submitButton').addEventListener('click', () => {
      this.handleSubmit();
    });
  }

  setupFileInput(type) {
    const uploadArea = document.getElementById(`${type}UploadArea`);
    const fileInput = document.getElementById(`${type}Input`);
    const removeButton = document.getElementById(`remove${this.capitalize(type)}`);

    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFile(file, type);
      }
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      const file = e.dataTransfer.files[0];
      if (file) {
        this.handleFile(file, type);
      }
    });

    removeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeFile(type);
    });
  }

  handleFile(file, type) {
    const validation = this.validateFile(file);
    
    if (!validation.valid) {
      this.showError(type, validation.error);
      return;
    }

    this.clearError(type);

    if (type === 'resume') {
      this.resumeFile = file;
    } else {
      this.transcriptFile = file;
    }

    this.updateFileInfo(file, type);
    this.updateSubmitButton();
  }

  validateFile(file) {
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: 'File size exceeds 5MB limit'
      };
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!this.allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: 'Invalid file format. Please upload PDF, DOC, or DOCX'
      };
    }

    return { valid: true };
  }

  updateFileInfo(file, type) {
    const fileInfo = document.getElementById(`${type}FileInfo`);
    const fileName = document.getElementById(`${type}FileName`);
    const fileSize = document.getElementById(`${type}FileSize`);

    fileName.textContent = file.name;
    fileSize.textContent = this.formatFileSize(file.size);
    fileInfo.classList.add('show');
  }

  removeFile(type) {
    if (type === 'resume') {
      this.resumeFile = null;
    } else {
      this.transcriptFile = null;
    }

    document.getElementById(`${type}Input`).value = '';
    document.getElementById(`${type}FileInfo`).classList.remove('show');
    this.clearError(type);
    this.updateSubmitButton();
  }

  showError(type, message) {
    const errorElement = document.getElementById(`${type}Error`);
    errorElement.textContent = message;
    errorElement.classList.add('show');
  }

  clearError(type) {
    const errorElement = document.getElementById(`${type}Error`);
    errorElement.textContent = '';
    errorElement.classList.remove('show');
  }

  updateSubmitButton() {
    const submitButton = document.getElementById('submitButton');
    submitButton.disabled = !(this.resumeFile || this.transcriptFile);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async handleSubmit() {
    const submitButton = document.getElementById('submitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
      const files = {};
      
      if (this.resumeFile) {
        const resumeData = await this.fileToBase64(this.resumeFile);
        files.resume = {
          name: this.resumeFile.name,
          size: this.resumeFile.size,
          type: this.resumeFile.type,
          data: resumeData,
          uploadDate: new Date().toISOString()
        };

        // If it's a PDF, try to extract text using FileReader + pdf.js
        try {
          const ext = this.resumeFile.name.split('.').pop().toLowerCase();
          if (ext === 'pdf') {
            const text = await fileToText(this.resumeFile);
            if (text) files.resume.text = text;
          }
        } catch (e) {
          console.warn('Resume text extraction failed:', e);
        }
      }
      
      if (this.transcriptFile) {
        const transcriptData = await this.fileToBase64(this.transcriptFile);
        files.transcript = {
          name: this.transcriptFile.name,
          size: this.transcriptFile.size,
          type: this.transcriptFile.type,
          data: transcriptData,
          uploadDate: new Date().toISOString()
        };

        try {
          const ext = this.transcriptFile.name.split('.').pop().toLowerCase();
          if (ext === 'pdf') {
            const text = await fileToText(this.transcriptFile);
            if (text) files.transcript.text = text;
          }
        } catch (e) {
          console.warn('Transcript text extraction failed:', e);
        }
      }

      const existingData = await chrome.storage.local.get('uploadedFiles');
      const uploadedFiles = existingData.uploadedFiles || {};
      
      Object.assign(uploadedFiles, files);
      
      await chrome.storage.local.set({ uploadedFiles });

      this.showSuccess();
      
      setTimeout(() => {
        this.resetForm();
        loadUploadedFiles();
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save documents: ' + error.message);
      submitButton.disabled = false;
      submitButton.textContent = 'Upload Documents';
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  showSuccess() {
    const successMessage = document.getElementById('successMessage');
    successMessage.classList.add('show');
  }

  resetForm() {
    this.removeFile('resume');
    this.removeFile('transcript');
    
    const successMessage = document.getElementById('successMessage');
    successMessage.classList.remove('show');
    
    const submitButton = document.getElementById('submitButton');
    submitButton.textContent = 'Upload Documents';
  }
}

const fileUploadManager = new FileUploadManager();

// ===== PDF TEXT EXTRACTION HELPERS =====
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;

  // Try to load pdf.js from CDN. In extension popup pages this may be blocked by CSP.
  // If loading fails, callers should handle the rejection and fall back to a simple extractor.
  return new Promise((resolve, reject) => {
    // First try loading a bundled copy from the extension (preferred)
    try {
      const localScript = document.createElement('script');
      localScript.src = chrome.runtime.getURL('lib/pdf.min.js');
      localScript.onload = () => {
        if (!window.pdfjsLib) {
          // If local script didn't expose pdfjs, try CDN next
          loadFromCDN().then(resolve).catch(reject);
          return;
        }
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
        } catch (e) {}
        resolve(window.pdfjsLib);
      };
      localScript.onerror = () => {
        // Local file not present or blocked, fall back to CDN
        loadFromCDN().then(resolve).catch(reject);
      };
      document.head.appendChild(localScript);
    } catch (err) {
      // If anything goes wrong, try CDN
      loadFromCDN().then(resolve).catch(reject);
    }

    function loadFromCDN() {
      return new Promise((res, rej) => {
        try {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
          script.onload = () => {
            if (!window.pdfjsLib) return rej(new Error('pdfjs failed to load'));
            try {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            } catch (e) {}
            res(window.pdfjsLib);
          };
          script.onerror = (e) => rej(new Error('Failed to load pdf.js: ' + e));
          document.head.appendChild(script);
        } catch (e) {
          rej(e);
        }
      });
    }
  });
}

async function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const arrayBuffer = reader.result;
      // Try pdf.js first. If it fails (likely due to CSP), fall back to a simple binary heuristic extractor.
      try {
        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        const cleaned = fullText.trim();
        if (cleaned) return resolve(cleaned);
        // If pdf.js returned empty, fall through to heuristic
      } catch (err) {
        console.warn('pdf.js extraction failed, falling back to heuristic extractor:', err);
      }

      try {
        const heur = simpleExtractTextFromPDFArrayBuffer(arrayBuffer);
        resolve(heur);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
}

function simpleExtractTextFromPDFArrayBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  // Decode using latin1 to preserve byte values
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  // Pull out long printable runs which often represent text objects in PDFs
  const matches = raw.match(/[\x20-\x7E]{5,}/g);
  if (!matches) return '';

  // Filter out common PDF structural tokens
  const filtered = matches.filter(s => !s.match(/^(\/Type|\/Font|\/Subtype|obj|endobj|stream|xref|trailer|startxref)$/i));

  // Join and normalize whitespace
  const text = filtered.join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\)/g, '')
    .trim();

  // Return empty string if result is too small
  if (text.length < 30) return '';
  return text;
}

// ===== UPLOADED FILES DISPLAY =====
async function loadUploadedFiles() {
  const data = await chrome.storage.local.get('uploadedFiles');
  const files = data.uploadedFiles || {};
  
  const filesList = document.getElementById('filesList');
  const uploadedFilesList = document.getElementById('uploadedFilesList');
  
  if (Object.keys(files).length === 0) {
    uploadedFilesList.style.display = 'none';
    return;
  }
  
  uploadedFilesList.style.display = 'block';
  filesList.innerHTML = '';
  
  Object.entries(files).forEach(([type, fileData]) => {
    const div = document.createElement('div');
    div.className = 'uploaded-file-item';
    div.innerHTML = `
      <div class="file-details">
        <span class="file-type">${type.toUpperCase()}</span>
        <span>${fileData.name}</span><br>
        <small style="color: #666;">Uploaded: ${new Date(fileData.uploadDate).toLocaleDateString()}</small>
      </div>
      <button class="delete-button" data-type="${type}">Delete</button>
    `;
    
    div.querySelector('.delete-button').addEventListener('click', async (e) => {
      if (confirm(`Delete ${type}?`)) {
        await deleteFile(type);
        loadUploadedFiles();
      }
    });
    
    filesList.appendChild(div);
  });
}

async function deleteFile(type) {
  const data = await chrome.storage.local.get('uploadedFiles');
  const files = data.uploadedFiles || {};
  
  delete files[type];
  
  await chrome.storage.local.set({ uploadedFiles: files });
}

loadUploadedFiles();

// ===== EXPORT FUNCTIONS =====
// Function to export comprehensive data to CSV
async function exportCoursesToCSV() {
  const courseData = await chrome.storage.local.get('scrapedCourseData');
  const prefsData = await chrome.storage.local.get('userPreferences');
  const filesData = await chrome.storage.local.get('uploadedFiles');
  
  if (!courseData.scrapedCourseData || !courseData.scrapedCourseData.courses) {
    alert('No course data to export. Please scrape courses first.');
    return;
  }
  
  const courses = courseData.scrapedCourseData.courses;
  const prefs = prefsData.userPreferences || {};
  const files = filesData.uploadedFiles || {};
  
  // Extract text from uploaded documents (if available). Prefer extracted text when present.
  const resumeText = files.resume ? (files.resume.text ? files.resume.text : `Resume uploaded: ${files.resume.name}`) : 'No resume uploaded';
  const transcriptText = files.transcript ? (files.transcript.text ? files.transcript.text : `Transcript uploaded: ${files.transcript.name}`) : 'No transcript uploaded';
  
  // CSV Headers - includes courses, preferences, and document info
  const headers = [
    'Course Name',
    'Description',
    'Syllabus Text',
    'LinkedIn Email',
    'LinkedIn Password',
    'Job Keywords',
    'Job Location',
    'Work Location Preference',
    'Position Type',
    'General Interests',
    'Preferred Industries',
    'Custom Interests',
    'Resume Info',
    'Transcript Info'
  ];
  
  // Create CSV content
  let csvContent = headers.join(',') + '\n';
  
  // Prepare preference data (same for all rows)
  const linkedinEmail = escapeCSV(prefs.linkedinEmail || '');
  const linkedinPassword = escapeCSV(prefs.linkedinPassword || '');
  const jobKeywords = escapeCSV(prefs.jobKeywords || '');
  const jobLocation = escapeCSV(prefs.jobLocation || '');
  const workLocation = escapeCSV(prefs.workLocation || '');
  const positionType = escapeCSV(prefs.positionType || '');
  const generalInterests = escapeCSV((prefs.generalInterests || []).join('; '));
  const preferredIndustries = escapeCSV((prefs.preferredIndustries || []).join('; '));
  const customInterests = escapeCSV(prefs.customInterests || '');
  
  // Add each course with all preference data
  courses.forEach(course => {
    const row = [
      escapeCSV(course.name || ''),
      escapeCSV(course.description || ''),
      escapeCSV(course.syllabusText || ''),
      linkedinEmail,
      linkedinPassword,
      jobKeywords,
      jobLocation,
      workLocation,
      positionType,
      generalInterests,
      preferredIndustries,
      customInterests,
      escapeCSV(resumeText),
      escapeCSV(transcriptText)
    ];
    csvContent += row.join(',') + '\n';
  });
  
  // Set flag to show preferences in content.js dashboard
  // Try to POST the CSV to the local processing server. If server is not running,
  // fall back to downloading the CSV for manual processing.
  try {
    const result = await postCsvToServer(csvContent);
    alert('CSV processed by local server. Recommendations updated.');
    console.log('Server result:', result);
  } catch (e) {
    // If posting fails, fallback to download and set exported flag locally
    await chrome.storage.local.set({ csvExported: true });
    downloadFile(csvContent, 'canvas_complete_data.csv', 'text/csv');
    alert('Local server not reachable — CSV downloaded instead.');
  }
}

// JSON export removed — CSV only

// Helper function to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}

// Helper function to download file
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

// Add event listeners for export buttons
document.getElementById('exportCSV').addEventListener('click', exportCoursesToCSV);

// POST CSV to local processing server and display returned recommended jobs
async function postCsvToServer(csvContent) {
  try {
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('file', blob, 'canvas_complete_data.csv');

    const resp = await fetch('http://127.0.0.1:5000/process-csv', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error('Server error: ' + txt);
    }

    const json = await resp.json();

    // Save recommended jobs to chrome.storage so content.js can read them
    if (json.top_matches) {
      await chrome.storage.local.set({ recommendedJobs: json.top_matches, csvExported: true });
    } else {
      // still mark exported so UI updates; clear recommendedJobs
      await chrome.storage.local.set({ recommendedJobs: [], csvExported: true });
    }

    return json;
  } catch (e) {
    console.error('Failed to post CSV to server:', e);
    throw e;
  }
}

// Show export buttons after successful scrape
async function checkAndShowExportButtons() {
  const data = await chrome.storage.local.get('scrapedCourseData');
  if (data.scrapedCourseData && data.scrapedCourseData.courses && data.scrapedCourseData.courses.length > 0) {
    document.getElementById('exportButtons').style.display = 'flex';
  }
}

// Check on load
checkAndShowExportButtons();
