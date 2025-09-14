// Global variables
let selectedFiles = [];

// CV Upload functionality
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('cvFile');
    const selectedFilesList = document.getElementById('selectedFilesList');
    const filesList = document.getElementById('filesList');

    // Only initialize upload functionality if elements exist (main page)
    if (!uploadArea || !fileInput) {
        return;
    }

    // Drag and drop functionality
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleMultipleFiles(files);
    });

    // File input change
    fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        handleMultipleFiles(files);
    });

    // Click to select files
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });

    // Handle multiple files
    function handleMultipleFiles(files) {
        const validFiles = files.filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ['pdf', 'docx'].includes(ext);
        });

        if (validFiles.length === 0) {
            alert('Lütfen geçerli dosya formatları seçin (PDF, DOCX)');
            return;
        }

        selectedFiles = [...selectedFiles, ...validFiles];
        displaySelectedFiles();
    }

    // Display selected files
    function displaySelectedFiles() {
        if (selectedFiles.length === 0) {
            selectedFilesList.style.display = 'none';
            return;
        }

        selectedFilesList.style.display = 'block';
        filesList.innerHTML = '';

        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <button onclick="removeFile(${index})" class="remove-file">Kaldır</button>
            `;
            filesList.appendChild(fileItem);
        });
    }

    // Upload all files
    function uploadAllFiles() {
        if (selectedFiles.length === 0) {
            alert('Yüklenecek dosya yok');
            return;
        }

        console.log('Starting upload of', selectedFiles.length, 'files');
        
        const uploadPromises = selectedFiles.map((file, index) => {
            console.log(`Uploading file ${index + 1}:`, file.name);
            return uploadSingleFile(file);
        });
        
        Promise.all(uploadPromises).then(results => {
            console.log('Upload results:', results);
            const successCount = results.filter(result => result.success).length;
            const errorCount = results.filter(result => !result.success).length;
            
            if (successCount > 0) {
                alert(`${successCount} dosya başarıyla yüklendi${errorCount > 0 ? `, ${errorCount} dosya yüklenemedi` : ''}`);
                clearSelectedFiles();
            } else {
                alert('Hiçbir dosya yüklenemedi');
            }
        }).catch(error => {
            console.error('Upload error:', error);
            alert('Dosya yükleme sırasında hata oluştu: ' + error.message);
        });
    }

    // Upload single file
    function uploadSingleFile(file) {
        return new Promise((resolve) => {
            console.log('Uploading file:', file.name, 'Size:', file.size);
            
            const formData = new FormData();
            formData.append('cv', file);

            fetch('/api/cv/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                console.log('Response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Response data:', data);
                if (data.success) {
                    console.log('File uploaded successfully:', data);
                    resolve({ success: true, data });
                } else {
                    console.error('Upload failed:', data.error);
                    resolve({ success: false, error: data.error });
                }
            })
            .catch(error => {
                console.error('Upload error:', error);
                resolve({ success: false, error: error.message });
            });
        });
    }

    // Make functions globally accessible
    window.removeFile = function(index) {
        selectedFiles.splice(index, 1);
        displaySelectedFiles();
    };

    window.uploadAllFiles = uploadAllFiles;

    window.clearSelectedFiles = function() {
        selectedFiles = [];
        displaySelectedFiles();
        fileInput.value = '';
    };

    window.resetUpload = function() {
        selectedFiles = [];
        displaySelectedFiles();
        fileInput.value = '';
    };
});

// HR Panel functionality
class HRPanel {
    constructor() {
        this.token = localStorage.getItem('hr_token');
        this.detectCurrentPage();
        this.init();
    }
    
    detectCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('candidates.html')) {
            this.currentPage = 'candidates';
        } else if (path.includes('jobs.html')) {
            this.currentPage = 'jobs';
        } else if (path.includes('reports.html')) {
            this.currentPage = 'reports';
        } else {
            this.currentPage = 'candidates'; // default
        }
        console.log('Current page detected:', this.currentPage);
    }

    init() {
        if (!this.token) {
            window.location.href = '/ik/login.html';
            return;
        }

        this.loadData();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Navigation - let the browser handle the navigation naturally
        // No need to prevent default or handle clicks since we're using direct href links

        // Filter buttons
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => this.applyFilters());
        }

        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFilters());
        }
    }

    navigateToPage(page) {
        // Since each page is now separate, navigate to the actual HTML file
        if (page === 'candidates') {
            window.location.href = 'candidates.html';
        } else if (page === 'jobs') {
            window.location.href = 'jobs.html';
        } else if (page === 'reports') {
            window.location.href = 'reports.html';
        }
    }

    loadData() {
        switch (this.currentPage) {
            case 'candidates':
                this.loadCandidates();
                this.loadJobsForSelection();
                break;
            case 'jobs':
                this.loadJobs();
                break;
            case 'reports':
                this.loadReports();
                break;
        }
    }

    async loadCandidates() {
        try {
            const response = await fetch('/api/hr/candidates', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Adaylar yüklenemedi');
            }
            
            const candidates = await response.json();
            this.renderCandidates(candidates);
        } catch (error) {
            console.error('Error loading candidates:', error);
            this.showError('Adaylar yüklenirken hata oluştu');
        }
    }

    renderCandidates(candidates) {
        const tbody = document.querySelector('#candidatesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Aday bulunamadı</td></tr>';
            return;
        }

        candidates.forEach(candidate => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <a href="#" onclick="hrPanel.downloadCV(${candidate.id})" class="candidate-name-link" title="CV'yi İndir">
                        ${candidate.name || 'Bilinmiyor'}
                    </a>
                </td>
                <td>${candidate.candidate_id}</td>
                <td>${new Date(candidate.uploaded_at).toLocaleDateString('tr-TR')}</td>
                <td>
                    <select id="jobSelect_${candidate.id}" class="form-control job-select" style="min-width: 200px;">
                        <option value="">İş ilanı seçin...</option>
                    </select>
                </td>
                <td>
                    <select onchange="hrPanel.updateTag(${candidate.id}, this.value)" class="form-control">
                        <option value="Beklemede" ${candidate.tag === 'Beklemede' ? 'selected' : ''}>Beklemede</option>
                        <option value="İlk Görüşme" ${candidate.tag === 'İlk Görüşme' ? 'selected' : ''}>İlk Görüşme</option>
                        <option value="Uygun Değil" ${candidate.tag === 'Uygun Değil' ? 'selected' : ''}>Uygun Değil</option>
                        <option value="Beklet" ${candidate.tag === 'Beklet' ? 'selected' : ''}>Beklet</option>
                        <option value="Onaylandı" ${candidate.tag === 'Onaylandı' ? 'selected' : ''}>Onaylandı</option>
                    </select>
                </td>
                <td>
                    <button onclick="hrPanel.editCandidate(${candidate.id})" class="btn btn-primary btn-sm" style="margin-right: 5px;">Düzenle</button>
                    <button onclick="hrPanel.analyzeCandidate(${candidate.id})" class="btn btn-info btn-sm" style="margin-right: 5px;">Analiz Et</button>
                    <button onclick="hrPanel.deleteCandidate(${candidate.id})" class="btn btn-danger btn-sm">Sil</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Populate job selects for all candidates
        this.populateAllJobSelects();
    }

    async loadJobs() {
        try {
            const response = await fetch('/api/hr/jobs', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('İlanlar yüklenemedi');
            }
            
            const jobs = await response.json();
            this.renderJobs(jobs);
        } catch (error) {
            console.error('Error loading jobs:', error);
            this.showError('İlanlar yüklenirken hata oluştu');
        }
    }

    renderJobs(jobs) {
        const tbody = document.querySelector('#jobsTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (jobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">İlan bulunamadı</td></tr>';
            return;
        }

        jobs.forEach(job => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${job.title}</td>
                <td>${job.department || 'Belirtilmemiş'}</td>
                <td>${job.experience_level || 'Belirtilmemiş'}</td>
                <td>${new Date(job.created_at).toLocaleDateString('tr-TR')}</td>
                <td>
                    <button class="btn btn-warning btn-sm edit-job-btn" data-job-id="${job.id}">✏️ Düzenle</button>
                    <button class="btn btn-danger btn-sm delete-job-btn" data-job-id="${job.id}">Sil</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to buttons
        tbody.querySelectorAll('.edit-job-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const jobId = e.target.getAttribute('data-job-id');
                console.log('Edit button clicked, job ID:', jobId);
                this.editJob(jobId);
            });
        });

        tbody.querySelectorAll('.delete-job-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const jobId = e.target.getAttribute('data-job-id');
                console.log('Delete button clicked, job ID:', jobId);
                this.deleteJob(jobId);
            });
        });
    }

    async loadReports() {
        try {
            const response = await fetch('/api/hr/reports', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Raporlar yüklenemedi');
            }
            
            const reports = await response.json();
            this.renderReports(reports);
        } catch (error) {
            console.error('Error loading reports:', error);
            this.showError('Raporlar yüklenirken hata oluştu');
        }
    }

    renderReports(reports) {
        const tbody = document.querySelector('#reportsTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Rapor bulunamadı</td></tr>';
            return;
        }

        reports.forEach(report => {
            // Extract score from analysis_result text
            const score = this.extractScoreFromText(report.analysis_result);
            const scoreClass = this.getScoreClass(score);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <a href="#" onclick="hrPanel.previewReport(${report.id})" style="color: #2c5aa0; text-decoration: none;">
                        ${report.candidate_name || 'Bilinmiyor'}
                    </a>
                </td>
                <td>${report.job_title || 'Genel Pozisyon'}</td>
                <td>
                    <div class="tag-cell">
                        <span class="tag-display ${this.getTagClass(report.tag)}">${report.tag || 'Beklemede'}</span>
                        <select onchange="hrPanel.updateTag(${report.candidate_id}, this.value)" class="tag-selector">
                            <option value="Beklemede" ${report.tag === 'Beklemede' ? 'selected' : ''}>Beklemede</option>
                            <option value="İlk Görüşme" ${report.tag === 'İlk Görüşme' ? 'selected' : ''}>İlk Görüşme</option>
                            <option value="Uygun Değil" ${report.tag === 'Uygun Değil' ? 'selected' : ''}>Uygun Değil</option>
                            <option value="Beklet" ${report.tag === 'Beklet' ? 'selected' : ''}>Beklet</option>
                            <option value="Onaylandı" ${report.tag === 'Onaylandı' ? 'selected' : ''}>Onaylandı</option>
                        </select>
                    </div>
                </td>
                <td>
                    <span class="score-display ${scoreClass}">${score}</span>
                </td>
                <td>${new Date(report.created_at).toLocaleDateString('tr-TR')}</td>
                <td>
                    <button onclick="hrPanel.downloadReport(${report.id})" class="btn btn-success btn-sm">İndir</button>
                    <button onclick="hrPanel.deleteReport(${report.id})" class="btn btn-danger btn-sm">Sil</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getTagClass(tag) {
        if (!tag) return 'beklemede';
        return tag.toLowerCase().replace(/\s+/g, '-').replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c');
    }

    extractScore(analysisData) {
        if (!analysisData || typeof analysisData === 'string') {
            try {
                analysisData = JSON.parse(analysisData);
            } catch (e) {
                return 0;
            }
        }
        return analysisData.overall_score || 0;
    }

    extractScoreFromText(analysisText) {
        if (!analysisText) return 0;
        
        try {
            // First try to parse as JSON
            const analysisData = JSON.parse(analysisText);
            if (analysisData && typeof analysisData.overall_score === 'number') {
                return analysisData.overall_score;
            }
        } catch (e) {
            // If JSON parsing fails, try text pattern matching
            const scoreMatch = analysisText.match(/(?:Uygunluk Skoru:?\s*)?(\d+)\/100/);
            if (scoreMatch) {
                return parseInt(scoreMatch[1]);
            }
        }
        
        return 0;
    }

    getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'very-good';
        if (score >= 70) return 'good';
        if (score >= 60) return 'average';
        if (score >= 50) return 'poor';
        return 'very-poor';
    }

    async analyzeCV(candidateId, jobId) {
        try {
            console.log(`Starting analysis for candidate ${candidateId}, job ${jobId}`);
            
            const response = await fetch('/api/hr/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ candidateId, jobId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analiz yapılamadı');
            }

            const result = await response.json();
            console.log('Analysis completed:', result);
            
            alert('Analiz tamamlandı! Raporlar sayfasından görüntüleyebilirsiniz.');
            this.loadData();
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Analiz sırasında hata oluştu: ' + error.message);
        }
    }

    async downloadReport(reportId) {
        try {
            const response = await fetch(`/api/hr/reports/${reportId}/download`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Rapor indirilemedi');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rapor_${reportId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Rapor indirilemedi: ' + error.message);
        }
    }

    async deleteJob(jobId) {
        if (!confirm('Bu ilanı silmek istediğinizden emin misiniz?')) {
            return;
        }

        try {
            const response = await fetch(`/api/hr/jobs/${jobId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('İlan silinemedi');
            }

            alert('İlan başarıyla silindi');
            this.loadJobs();
        } catch (error) {
            console.error('Delete job error:', error);
            alert('İlan silinemedi: ' + error.message);
        }
    }

    async deleteCandidate(candidateId) {
        if (!confirm('Bu adayı silmek istediğinizden emin misiniz?')) {
            return;
        }

        try {
            const response = await fetch(`/api/hr/candidates/${candidateId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Aday silinemedi');
            }

            alert('Aday başarıyla silindi');
            this.loadCandidates();
        } catch (error) {
            console.error('Delete candidate error:', error);
            alert('Aday silinemedi: ' + error.message);
        }
    }

    async editCandidate(candidateId) {
        // Get candidate data
        try {
            const response = await fetch(`/api/hr/candidates/${candidateId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Aday bilgileri alınamadı');
            }

            const candidate = await response.json();
            this.showEditCandidateModal(candidate);
        } catch (error) {
            console.error('Error loading candidate:', error);
            alert('Aday bilgileri yüklenemedi: ' + error.message);
        }
    }

    showEditCandidateModal(candidate) {
        // Create edit modal if it doesn't exist
        let modal = document.getElementById('editCandidateModal');
        if (!modal) {
            modal = this.createEditCandidateModal();
        }

        // Populate form
        document.getElementById('editCandidateId').value = candidate.id;
        document.getElementById('editCandidateName').value = candidate.name || '';
        document.getElementById('editCandidateTag').value = candidate.tag || 'Beklemede';

        // Show modal
        modal.style.display = 'block';
    }

    createEditCandidateModal() {
        const modal = document.createElement('div');
        modal.id = 'editCandidateModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Aday Düzenle</h3>
                    <span class="close" onclick="this.closest('.modal').style.display='none'">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="editCandidateForm">
                        <input type="hidden" id="editCandidateId">
                        <div class="form-group">
                            <label for="editCandidateName">Ad Soyad:</label>
                            <input type="text" id="editCandidateName" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="editCandidateTag">Etiket:</label>
                            <select id="editCandidateTag" class="form-control">
                                <option value="Beklemede">Beklemede</option>
                                <option value="İlk Görüşme">İlk Görüşme</option>
                                <option value="Uygun Değil">Uygun Değil</option>
                                <option value="Beklet">Beklet</option>
                                <option value="Onaylandı">Onaylandı</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'">İptal</button>
                    <button type="button" class="btn btn-primary" onclick="hrPanel.saveCandidateEdit()">Kaydet</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add form submission handler
        document.getElementById('editCandidateForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCandidateEdit();
        });

        return modal;
    }

    async saveCandidateEdit() {
        const candidateId = document.getElementById('editCandidateId').value;
        const name = document.getElementById('editCandidateName').value;
        const tag = document.getElementById('editCandidateTag').value;

        if (!name.trim()) {
            alert('Ad soyad boş olamaz');
            return;
        }

        try {
            const response = await fetch(`/api/hr/candidates/${candidateId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ name, tag })
            });

            if (!response.ok) {
                throw new Error('Aday güncellenemedi');
            }

            alert('Aday başarıyla güncellendi');
            document.getElementById('editCandidateModal').style.display = 'none';
            this.loadCandidates();
        } catch (error) {
            console.error('Error updating candidate:', error);
            alert('Aday güncellenemedi: ' + error.message);
        }
    }

    async loadJobsForSelection() {
        try {
            const response = await fetch('/api/hr/jobs', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('İş ilanları yüklenemedi');
            }
            
            const jobs = await response.json();
            this.jobs = jobs; // Store jobs for later use
            this.populateJobSelect(jobs);
        } catch (error) {
            console.error('Error loading jobs for selection:', error);
        }
    }

    populateJobSelect(jobs) {
        const jobSelect = document.getElementById('jobSelect');
        if (!jobSelect) return;

        // Clear existing options except the first one
        jobSelect.innerHTML = '<option value="">İş ilanı seçin...</option>';
        
        jobs.forEach(job => {
            const option = document.createElement('option');
            option.value = job.id;
            option.textContent = `${job.title} - ${job.department}`;
            jobSelect.appendChild(option);
        });
    }

    populateAllJobSelects() {
        // Get all job select elements
        const jobSelects = document.querySelectorAll('.job-select');
        
        jobSelects.forEach(select => {
            // Clear existing options except the first one
            select.innerHTML = '<option value="">İş ilanı seçin...</option>';
            
            // Add jobs to each select
            if (this.jobs) {
                this.jobs.forEach(job => {
                    const option = document.createElement('option');
                    option.value = job.id;
                    option.textContent = `${job.title} - ${job.department}`;
                    select.appendChild(option);
                });
            }
        });
    }

    async analyzeCandidate(candidateId) {
        // Check if job is selected for this specific candidate
        const jobSelect = document.getElementById(`jobSelect_${candidateId}`);
        if (!jobSelect || !jobSelect.value) {
            alert('Lütfen bu aday için bir iş ilanı seçin!');
            return;
        }

        if (!confirm('Bu adayı seçilen iş ilanına göre analiz etmek istediğinizden emin misiniz? Analiz işlemi biraz zaman alabilir.')) {
            return;
        }

        // Show loading indicator
        this.showLoadingIndicator(candidateId);

        try {
            const response = await fetch('/api/hr/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ 
                    candidateId: candidateId,
                    jobId: jobSelect.value
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analiz başlatılamadı');
            }

            const result = await response.json();
            
            // Hide loading indicator
            this.hideLoadingIndicator(candidateId);
            
            // Show success message
            this.showSuccessMessage('Analiz başarıyla tamamlandı! Raporlar sayfasından görüntüleyebilirsiniz.');
            
            // Optionally refresh candidates list
            this.loadCandidates();
        } catch (error) {
            console.error('Error analyzing candidate:', error);
            
            // Hide loading indicator
            this.hideLoadingIndicator(candidateId);
            
            // Show error message
            this.showErrorMessage('Analiz yapılamadı: ' + error.message);
        }
    }

    async downloadCV(candidateId) {
        try {
            const response = await fetch(`/api/hr/candidates/${candidateId}/download`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('CV indirilemedi');
            }

            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'CV.pdf';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            // Create blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading CV:', error);
            alert('CV indirilemedi: ' + error.message);
        }
    }

    async deleteReport(reportId) {
        if (!confirm('Bu raporu silmek istediğinizden emin misiniz?')) {
            return;
        }

        try {
            const response = await fetch(`/api/hr/reports/${reportId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Rapor silinemedi');
            }

            alert('Rapor başarıyla silindi');
            this.loadReports();
        } catch (error) {
            console.error('Delete report error:', error);
            alert('Rapor silinemedi: ' + error.message);
        }
    }

    async previewReport(reportId) {
        try {
            const response = await fetch(`/api/hr/reports/${reportId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Rapor yüklenemedi');
            }

            const report = await response.json();
            this.renderReportPreview(report);
        } catch (error) {
            console.error('Preview error:', error);
            alert('Rapor önizlenemedi: ' + error.message);
        }
    }

    renderReportPreview(report) {
        // Remove any existing preview
        this.closeReportPreview();

        // Parse analysis_result as JSON
        let analysisData;
        try {
            analysisData = JSON.parse(report.analysis_result);
        } catch (e) {
            console.error('Error parsing analysis result:', e);
            this.showError('Rapor verisi okunamadı. Lütfen raporu indirerek görüntüleyin.');
            return;
        }
        
        // Create preview HTML as table row
        const previewHTML = `
            <tr class="report-preview-row" data-report-id="${report.id}">
                <td colspan="6">
                    <div class="report-preview-content">
                        <div class="report-preview-header">
                            <h3>Rapor Önizleme - ${report.candidate_name}</h3>
                            <button onclick="hrPanel.closeReportPreview()" class="btn btn-sm btn-secondary">Kapat</button>
                        </div>
                        <div class="report-preview-body">
                            <div class="report-section">
                                <h4>Genel Puan</h4>
                                <div style="font-size: 1.5rem; font-weight: bold; color: #2c5aa0;">${analysisData.overall_score}/100</div>
                            </div>
                            <div class="report-section">
                                <h4>Eşleşen Beceriler</h4>
                                <ul>
                                    ${analysisData.matched_skills.slice(0, 5).map(skill => `<li>${skill}</li>`).join('')}
                                    ${analysisData.matched_skills.length > 5 ? `<li><em>+${analysisData.matched_skills.length - 5} daha...</em></li>` : ''}
                                </ul>
                            </div>
                            <div class="report-section">
                                <h4>Kısmi Beceriler</h4>
                                <ul>
                                    ${analysisData.partial_skills.slice(0, 5).map(skill => `<li>${skill}</li>`).join('')}
                                    ${analysisData.partial_skills.length > 5 ? `<li><em>+${analysisData.partial_skills.length - 5} daha...</em></li>` : ''}
                                </ul>
                            </div>
                            <div class="report-section">
                                <h4>Eksik Beceriler</h4>
                                <ul>
                                    ${analysisData.missing_skills.slice(0, 5).map(skill => `<li>${skill}</li>`).join('')}
                                    ${analysisData.missing_skills.length > 5 ? `<li><em>+${analysisData.missing_skills.length - 5} daha...</em></li>` : ''}
                                </ul>
                            </div>
                            <div class="report-section">
                                <h4>Güçlü Yönler</h4>
                                <ul>
                                    ${analysisData.strengths.slice(0, 3).map(strength => `<li>${strength}</li>`).join('')}
                                    ${analysisData.strengths.length > 3 ? `<li><em>+${analysisData.strengths.length - 3} daha...</em></li>` : ''}
                                </ul>
                            </div>
                            <div class="report-section">
                                <h4>Geliştirilmesi Gereken Alanlar</h4>
                                <ul>
                                    ${analysisData.weaknesses.slice(0, 3).map(weakness => `<li>${weakness}</li>`).join('')}
                                    ${analysisData.weaknesses.length > 3 ? `<li><em>+${analysisData.weaknesses.length - 3} daha...</em></li>` : ''}
                                </ul>
                            </div>
                            <div class="report-section">
                                <h4>Öneriler</h4>
                                <p>${analysisData.recommendation.length > 150 ? analysisData.recommendation.substring(0, 150) + '...' : analysisData.recommendation}</p>
                            </div>
                            <div class="report-section">
                                <h4>Özet</h4>
                                <p>${analysisData.summary.length > 150 ? analysisData.summary.substring(0, 150) + '...' : analysisData.summary}</p>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        
        // Find the table row for this report and insert preview after that specific row
        const tableRows = document.querySelectorAll('#reportsTable tbody tr');
        let targetRow = null;
        
        for (let row of tableRows) {
            const candidateLink = row.querySelector('a[onclick*="previewReport"]');
            if (candidateLink && candidateLink.onclick.toString().includes(report.id)) {
                targetRow = row;
                break;
            }
        }
        
        if (targetRow) {
            // Insert preview directly after the target row
            targetRow.insertAdjacentHTML('afterend', previewHTML);
        } else {
            // Fallback: add after table container
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) {
                tableContainer.insertAdjacentHTML('afterend', previewHTML);
            }
        }
    }

    closeReportPreview() {
        // Remove all existing previews
        const existingPreviews = document.querySelectorAll('.report-preview-row');
        existingPreviews.forEach(preview => preview.remove());
    }

    async updateTag(candidateId, tag) {
        try {
            const response = await fetch(`/api/hr/candidates/${candidateId}/tag`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ tag })
            });

            if (!response.ok) {
                throw new Error('Etiket güncellenemedi');
            }

            // Anında UI güncellemesi
            this.updateTagUI(candidateId, tag);
        } catch (error) {
            console.error('Update tag error:', error);
            // Hata durumunda eski değere geri döndür
            const selectElement = document.querySelector(`select[onchange*="${candidateId}"]`);
            if (selectElement) {
                // Eski değeri geri yükle (bu durumda veritabanından çekmek gerekir)
                this.loadData();
            }
        }
    }

    updateTagUI(candidateId, tag) {
        // Find the select element and update its value
        const selectElement = document.querySelector(`select[onchange*="${candidateId}"]`);
        if (selectElement) {
            selectElement.value = tag;
            
            // Etiket görünümünü de güncelle (raporlar sayfası için)
            const tagDisplay = selectElement.closest('td')?.querySelector('.tag-display');
            if (tagDisplay) {
                tagDisplay.textContent = tag;
                // Eski CSS sınıflarını kaldır
                tagDisplay.className = 'tag-display';
                // Yeni CSS sınıfını ekle
                tagDisplay.classList.add(this.getTagClass(tag));
            }
        }
    }

    async applyFilters() {
        const search = document.getElementById('searchInput')?.value || '';
        const tags = this.getSelectedTags();
        const scores = this.getSelectedScores();

        try {
            let url = '/api/hr/reports?';
            const params = new URLSearchParams();
            
            if (search) params.append('search', search);
            if (tags.length > 0) params.append('tags', tags.join(','));
            if (scores.length > 0) params.append('scores', scores.join(','));
            
            url += params.toString();

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Filtreleme yapılamadı');
            }

            const reports = await response.json();
            this.renderReports(reports);
        } catch (error) {
            console.error('Filter error:', error);
            this.showError('Filtreleme sırasında hata oluştu');
        }
    }

    getSelectedTags() {
        const checkboxes = document.querySelectorAll('#tagFilter input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    updateTagFilterButton() {
        const selectedTags = this.getSelectedTags();
        const button = document.querySelector('#tagFilter .filter-btn');
        if (button) {
            button.textContent = selectedTags.length > 0 ? `Etiketler (${selectedTags.length})` : 'Etiketler';
            button.classList.toggle('active', selectedTags.length > 0);
        }
    }

    initTagFilter() {
        const tagFilter = document.getElementById('tagFilter');
        if (!tagFilter) {
            console.log('Tag filter not found');
            return;
        }

        const button = tagFilter.querySelector('.filter-btn');
        const dropdown = tagFilter.querySelector('.tag-dropdown');
        
        console.log('Tag filter elements:', { button: !!button, dropdown: !!dropdown });

        if (button && dropdown) {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Tag filter button clicked, current display:', dropdown.style.display);
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                console.log('Tag filter dropdown display set to:', dropdown.style.display);
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });

        // Handle checkbox changes
        const checkboxes = tagFilter.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTagFilterButton();
            });
        });
    }

    getSelectedScores() {
        const checkboxes = document.querySelectorAll('#scoreFilter input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    updateScoreFilterButton() {
        const selectedScores = this.getSelectedScores();
        const button = document.querySelector('#scoreFilter .filter-btn');
        if (button) {
            button.textContent = selectedScores.length > 0 ? `Puanlar (${selectedScores.length})` : 'Puanlar';
            button.classList.toggle('active', selectedScores.length > 0);
        }
    }

    initScoreFilter() {
        const scoreFilter = document.getElementById('scoreFilter');
        if (!scoreFilter) return;

        const button = scoreFilter.querySelector('.filter-btn');
        const dropdown = scoreFilter.querySelector('.score-dropdown');

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });

        // Handle checkbox changes
        const checkboxes = scoreFilter.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateScoreFilterButton();
            });
        });
    }

    clearFilters() {
        // Clear search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';

        // Clear tag checkboxes
        const tagCheckboxes = document.querySelectorAll('#tagFilter input[type="checkbox"]');
        tagCheckboxes.forEach(cb => cb.checked = false);

        // Clear score checkboxes
        const scoreCheckboxes = document.querySelectorAll('#scoreFilter input[type="checkbox"]');
        scoreCheckboxes.forEach(cb => cb.checked = false);

        // Update button texts
        this.updateTagFilterButton();
        this.updateScoreFilterButton();

        // Reload data
        this.loadData();
    }

    async editJob(jobId) {
        console.log('editJob function called with jobId:', jobId);
        console.log('Token exists:', !!this.token);
        
        try {
            console.log('Fetching job data...');
            const response = await fetch(`/api/hr/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error('İlan bilgileri alınamadı');
            }

            const job = await response.json();
            console.log('Job data received:', job);
            console.log('Calling showEditJobModal...');
            this.showEditJobModal(job);
        } catch (error) {
            console.error('Edit job error:', error);
            alert('İlan bilgileri alınamadı: ' + error.message);
        }
    }

    showEditJobModal(job) {
        console.log('showEditJobModal called with job:', job);
        
        // Try to find modal, if not found create it
        let modal = document.getElementById('editJobModal');
        console.log('Modal element found:', !!modal);
        
        if (!modal) {
            console.log('Modal not found, creating it...');
            modal = this.createEditJobModal();
        }
        
        this.populateAndShowModal(modal, job);
    }
    
    createEditJobModal() {
        console.log('Creating edit job modal...');
        
        // Create modal HTML
        const modalHTML = `
            <div id="editJobModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>İlan Düzenle</h3>
                        <span class="close" onclick="closeEditModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="editJobForm">
                            <input type="hidden" id="editJobId" name="id">
                            
                            <div class="form-group">
                                <label for="editTitle">İlan Başlığı</label>
                                <input type="text" id="editTitle" name="title" class="form-control" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="editDescription">İş Açıklaması</label>
                                <textarea id="editDescription" name="description" class="form-control" rows="4" required></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="editRequirements">Gereksinimler</label>
                                <textarea id="editRequirements" name="requirements" class="form-control" rows="4" required></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="editLocation">Lokasyon</label>
                                <input type="text" id="editLocation" name="location" class="form-control">
                            </div>
                            
                            <div class="form-group">
                                <label for="editDepartment">Departman</label>
                                <input type="text" id="editDepartment" name="department" class="form-control">
                            </div>
                            
                            <div class="form-group">
                                <label for="editExperienceLevel">Deneyim Seviyesi</label>
                                <select id="editExperienceLevel" name="experience_level" class="form-control">
                                    <option value="">Seçiniz</option>
                                    <option value="Stajyer">Stajyer</option>
                                    <option value="Junior">Junior</option>
                                    <option value="Mid-Level">Mid-Level</option>
                                    <option value="Senior">Senior</option>
                                    <option value="Lead">Lead</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="editEmploymentType">İstihdam Türü</label>
                                <select id="editEmploymentType" name="employment_type" class="form-control">
                                    <option value="">Seçiniz</option>
                                    <option value="Tam Zamanlı">Tam Zamanlı</option>
                                    <option value="Yarı Zamanlı">Yarı Zamanlı</option>
                                    <option value="Sözleşmeli">Sözleşmeli</option>
                                    <option value="Freelance">Freelance</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="editSalaryRange">Maaş Aralığı</label>
                                <input type="text" id="editSalaryRange" name="salary_range" class="form-control" placeholder="örn: 8000-12000 TL">
                            </div>
                            
                            <button type="submit" class="btn btn-primary">Güncelle</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add form submit event listener
        document.getElementById('editJobForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateJob();
        });
        
        console.log('Edit job modal created successfully');
        return document.getElementById('editJobModal');
    }
    
    populateAndShowModal(modal, job) {
        console.log('populateAndShowModal called with job:', job);

        // Populate form fields
        console.log('Populating form fields...');
        document.getElementById('editJobId').value = job.id;
        document.getElementById('editTitle').value = job.title;
        document.getElementById('editDescription').value = job.description;
        document.getElementById('editRequirements').value = job.requirements;
        document.getElementById('editLocation').value = job.location || '';
        document.getElementById('editDepartment').value = job.department || '';
        document.getElementById('editExperienceLevel').value = job.experience_level || '';
        document.getElementById('editEmploymentType').value = job.employment_type || '';
        document.getElementById('editSalaryRange').value = job.salary_range || '';

        console.log('Showing modal...');
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
        console.log('Modal should be visible now');
    }

    async updateJob() {
        const form = document.getElementById('editJobForm');
        const formData = new FormData(form);
        
        const jobData = {
            title: formData.get('title'),
            description: formData.get('description'),
            requirements: formData.get('requirements'),
            location: formData.get('location'),
            department: formData.get('department'),
            experience_level: formData.get('experience_level'),
            employment_type: formData.get('employment_type'),
            salary_range: formData.get('salary_range')
        };

        try {
            const response = await fetch(`/api/hr/jobs/${formData.get('id')}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(jobData)
            });

            if (!response.ok) {
                throw new Error('İlan güncellenemedi');
            }

            alert('İlan başarıyla güncellendi');
            this.closeEditModal();
            this.loadJobs();
        } catch (error) {
            console.error('Update job error:', error);
            alert('İlan güncellenemedi: ' + error.message);
        }
    }

    closeEditModal() {
        const modal = document.getElementById('editJobModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    showError(message) {
        alert(message);
    }

    showLoadingIndicator(candidateId) {
        // Show full screen loading overlay
        this.showFullScreenLoading();
        
        // Find the analyze button for this candidate
        const analyzeButton = document.querySelector(`button[onclick*="analyzeCandidate(${candidateId})"]`);
        if (analyzeButton) {
            // Store original text
            analyzeButton.dataset.originalText = analyzeButton.textContent;
            
            // Show loading state
            analyzeButton.disabled = true;
            analyzeButton.innerHTML = '<span class="loading-spinner"></span> Analiz Ediliyor...';
            analyzeButton.classList.add('loading');
        }
    }

    hideLoadingIndicator(candidateId) {
        // Hide full screen loading overlay
        this.hideFullScreenLoading();
        
        // Find the analyze button for this candidate
        const analyzeButton = document.querySelector(`button[onclick*="analyzeCandidate(${candidateId})"]`);
        if (analyzeButton) {
            // Restore original state
            analyzeButton.disabled = false;
            analyzeButton.textContent = analyzeButton.dataset.originalText || 'Analiz Et';
            analyzeButton.classList.remove('loading');
        }
    }

    showSuccessMessage(message) {
        this.showNotification(message, 'success');
    }

    showErrorMessage(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    showFullScreenLoading() {
        // Remove existing loading overlay if any
        const existingOverlay = document.querySelector('.fullscreen-loading');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create full screen loading overlay
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-loading';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner-large"></div>
                <h3>CV Analizi Yapılıyor...</h3>
                <p>Lütfen bekleyin, bu işlem birkaç dakika sürebilir.</p>
            </div>
        `;

        // Add to page
        document.body.appendChild(overlay);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    hideFullScreenLoading() {
        // Remove loading overlay
        const overlay = document.querySelector('.fullscreen-loading');
        if (overlay) {
            overlay.remove();
        }
        
        // Restore body scroll
        document.body.style.overflow = '';
    }
}

// Global functions
window.closeReportPreview = function() {
    if (window.hrPanel) {
        window.hrPanel.closeReportPreview();
    }
};

window.closeEditModal = function() {
    if (window.hrPanel) {
        window.hrPanel.closeEditModal();
    }
};

window.editJob = function(jobId) {
    console.log('editJob called with ID:', jobId);
    console.log('hrPanel exists:', !!window.hrPanel);
    
    if (window.hrPanel) {
        console.log('Calling hrPanel.editJob');
        window.hrPanel.editJob(jobId);
    } else {
        console.error('HR Panel not initialized');
        alert('Sistem henüz yüklenmedi. Lütfen sayfayı yenileyin.');
    }
};

window.deleteJob = function(jobId) {
    if (window.hrPanel) {
        window.hrPanel.deleteJob(jobId);
    } else {
        console.error('HR Panel not initialized');
        alert('Sistem henüz yüklenmedi. Lütfen sayfayı yenileyin.');
    }
};

window.applyFilters = function() {
    if (window.hrPanel) {
        window.hrPanel.applyFilters();
    }
};

window.clearFilters = function() {
    if (window.hrPanel) {
        window.hrPanel.clearFilters();
    }
};

// Initialize HR Panel
if (document.querySelector('.hr-container')) {
    console.log('Initializing HR Panel...');
    window.hrPanel = new HRPanel();
    console.log('HR Panel initialized:', !!window.hrPanel);
} else {
    console.log('No .hr-container found, HR Panel not initialized');
}
