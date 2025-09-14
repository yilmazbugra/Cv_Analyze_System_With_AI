const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// OpenAI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Database setup
const db = new sqlite3.Database('database.sqlite');

// Initialize database tables
db.serialize(() => {
    // HR users table
    db.run(`CREATE TABLE IF NOT EXISTS hr_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Jobs table
    db.run(`CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        requirements TEXT NOT NULL,
        location TEXT,
        department TEXT,
        experience_level TEXT,
        employment_type TEXT,
        salary_range TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Candidates table
    db.run(`CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT UNIQUE NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        cv_file_path TEXT NOT NULL,
        cv_text TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        tag TEXT DEFAULT 'Beklemede',
        notes TEXT
    )`);

    // Analysis reports table
    db.run(`CREATE TABLE IF NOT EXISTS analysis_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id INTEGER,
        job_id INTEGER,
        analysis_result TEXT NOT NULL,
        pdf_filename TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES candidates (id),
        FOREIGN KEY (job_id) REFERENCES jobs (id)
    )`);

    // Insert default HR user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO hr_users (email, password) VALUES (?, ?)`, 
        ['admin@ik.com', hashedPassword]);
});

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/cvs/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cv-${uniqueSuffix}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || 
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.mimetype === 'text/plain') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOCX and TXT files are allowed'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Extract text from PDF
async function extractTextFromPDF(filePath) {
    try {
        // Check if file exists and has content
        if (!fs.existsSync(filePath)) {
            throw new Error('PDF file does not exist');
        }
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('PDF file is empty');
        }
        
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        
        if (!data || !data.text) {
            throw new Error('No text content found in PDF');
        }
        
        return data.text;
    } catch (error) {
        console.error('PDF parsing error:', error);
        throw new Error('Failed to parse PDF file: ' + error.message);
    }
}

// Extract text from DOCX
async function extractTextFromDOCX(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error('DOCX parsing error:', error);
        throw new Error('Failed to parse DOCX file');
    }
}

// Improved CV Analysis Prompt - JSON Based
function getCVAnalysisPrompt(cvText, jobTitle, jobDescription, jobRequirements) {
    return `🚨 CRITICAL WARNING: You MUST follow these rules exactly or you will FAIL! 🚨

You are an expert HR analyst and ATS system. 
Your task: Compare the given CV text and the job posting details, 
and output ONLY a valid JSON object. No explanations, no markdown, no extra text.

⚠️ FIRST AND MOST IMPORTANT RULE: 
If job title is "Genel Pozisyon" or job requirements are generic/vague, 
overall_score MUST be between 20-30, NO EXCEPTIONS!
Even if candidate has 10+ years experience, generic positions get low scores!
This is a HARD LIMIT - never exceed 30 for generic positions!

SPECIFIC EXAMPLES OF GENERIC REQUIREMENTS:
- "Updated Requirements" = GENERIC (max 30 points)
- "Test Requirements" = GENERIC (max 30 points)  
- "Generic Requirements" = GENERIC (max 30 points)
- "Temel iş becerileri" = GENERIC (max 30 points)
- Any requirements without specific technical skills = GENERIC (max 30 points)

CV Text:
${cvText}

Job Posting:
Title: ${jobTitle}
Description: ${jobDescription}
Required Skills: ${jobRequirements}

Respond strictly in the following JSON schema:

{
  "overall_score": number,                // 0-100 overall compatibility score
  "matched_skills": [string],
  "partial_skills": [string],
  "missing_skills": [string],
  "experience_level": "Junior|Mid|Senior",
  "education_match": boolean,
  "language_skills": [string],
  "strengths": [string],
  "weaknesses": [string],
  "recommendation": string,
  "ats_feedback": [string],
  "summary": string
}

CRITICAL SCORING RULES - FOLLOW EXACTLY:

1. FIRST CHECK: If job requirements are generic, vague, or empty:
   - If job requirements contain only generic terms like "Temel iş becerileri", "Genel pozisyon", "İş deneyimi"
   - OR if requirements are less than 20 characters
   - OR if no specific technical skills are mentioned
   - OR if job title is "Genel Pozisyon" or similar
   - OR if requirements contain generic phrases like "Updated Requirements", "Test Requirements", "Generic Requirements"
   - OR if requirements don't contain specific technical skills (React, Python, SQL, etc.)
   - THEN overall_score MUST be between 20-30 (not higher!)
   - NO EXCEPTIONS - even experienced candidates get low scores for generic positions
   - HARD LIMIT: Never exceed 30 for generic positions!

2. SKILL MATCHING RULES:
   - Extract ALL specific skills from job requirements
   - Count how many skills the candidate actually has
   - Calculate match percentage: (matched_skills / total_required_skills) * 100

3. SCORE CALCULATION:
   - If match percentage >= 80%: overall_score = 80-95
   - If match percentage >= 60%: overall_score = 65-80
   - If match percentage >= 40%: overall_score = 45-65
   - If match percentage < 40%: overall_score = 20-45
   - If match percentage = 0%: overall_score = 5-20

4. EXPERIENCE LEVEL BONUS/PENALTY:
   - If candidate has 5+ years relevant experience: overall_score MUST be increased by 10-15 points
   - If candidate has 10+ years relevant experience: overall_score MUST be increased by 15-20 points
   - If candidate has no relevant experience: overall_score MUST be reduced by 20-30 points
   - If candidate is junior but job requires senior: overall_score MUST be reduced by 15-25 points
   - If candidate is senior and job requires senior: overall_score MUST be increased by 5-10 points

5. SPECIAL CASES - HIGH EXPERIENCE BONUS (ONLY for specific positions):
   - If candidate has 10+ years experience AND matches 70%+ skills AND job is specific: overall_score MUST be 85-95
   - If candidate has 5+ years experience AND matches 80%+ skills AND job is specific: overall_score MUST be 80-90
   - If candidate is Senior level AND job requires Senior AND job is specific: overall_score MUST be at least 75
   - If candidate has leadership/management experience AND job is specific: overall_score MUST be increased by 5-10 points
   - If candidate has 10+ years experience AND matches 80%+ skills AND job is specific: overall_score MUST be 90-95
   - If candidate has 10+ years experience AND matches 90%+ skills AND job is specific: overall_score MUST be 95-100
   - NOTE: These bonuses DO NOT apply to "Genel Pozisyon" or generic positions

6. STRICT OVERRIDE RULES - HIGHEST PRIORITY:
   - If job is "Genel Pozisyon" or similar: overall_score MUST be 20-30 (NO EXCEPTIONS!)
   - If job requirements are generic/vague: overall_score MUST NOT exceed 30
   - If no specific skills match: overall_score MUST NOT exceed 30
   - If candidate has no relevant experience: overall_score MUST NOT exceed 40
   - Generic positions ALWAYS get low scores regardless of candidate experience
   - HARD LIMIT: Generic positions NEVER exceed 30 points!

7. QUALITY CHECKS:
   - If CV text is too short (< 100 characters): overall_score MUST be reduced by 20 points
   - If CV contains no technical skills: overall_score MUST be reduced by 15 points
   - If CV has spelling/grammar errors: overall_score MUST be reduced by 5-10 points

CRITICAL FINAL RULES - MUST BE FOLLOWED:
- All text values inside the JSON (strengths, weaknesses, summary, etc.) MUST be in TURKISH.
- You MUST follow these rules exactly - no exceptions!
- MOST IMPORTANT: If job title is "Genel Pozisyon" or job requirements are generic, overall_score MUST be 20-30, NO EXCEPTIONS!
- Generic positions get low scores regardless of candidate experience or skills
- Only specific job positions with clear requirements get high scores
- HARD LIMIT: Generic positions NEVER exceed 30 points!
- Example: "Genel Pozisyon" + 10+ years experience = 20-30 points (NOT 35+)
- Example: "Senior Frontend Developer" + 10+ years React experience = 85-95 points
- Example: Generic requirements + any experience = 20-30 points`;
}

// Generate PDF report
async function generatePDFReport(analysisData, candidateName, jobTitle) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CV Analiz Raporu</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: #fff;
            }
            .header {
                text-align: center;
                border-bottom: 3px solid #2c3e50;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .header h1 {
                color: #2c3e50;
                margin: 0;
                font-size: 28px;
            }
            .header p {
                color: #7f8c8d;
                margin: 5px 0;
            }
            .score-display {
                background: linear-gradient(135deg, #3498db, #2980b9);
                color: white;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                margin: 20px 0;
                font-size: 24px;
                font-weight: bold;
            }
            .section {
                margin-bottom: 25px;
                page-break-inside: avoid;
            }
            .section h2 {
                color: #34495e;
                border-left: 4px solid #3498db;
                padding-left: 15px;
                margin-bottom: 15px;
                font-size: 20px;
            }
            .skills-grid {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 20px;
                margin: 20px 0;
            }
            .skill-category {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #3498db;
            }
            .skill-category h3 {
                margin: 0 0 10px 0;
                color: #2c3e50;
                font-size: 16px;
            }
            .skill-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .skill-list li {
                background: white;
                margin: 5px 0;
                padding: 8px 12px;
                border-radius: 4px;
                border-left: 3px solid #27ae60;
            }
            .matched-skills li {
                border-left-color: #27ae60;
            }
            .partial-skills li {
                border-left-color: #f39c12;
            }
            .missing-skills li {
                border-left-color: #e74c3c;
            }
            .recommendation {
                background: #e8f5e8;
                border: 1px solid #27ae60;
                padding: 15px;
                border-radius: 5px;
                margin: 15px 0;
            }
            .strengths-weaknesses {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin: 20px 0;
            }
            .strengths {
                background: #d4edda;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #28a745;
            }
            .weaknesses {
                background: #f8d7da;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #dc3545;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #bdc3c7;
                text-align: center;
                color: #7f8c8d;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>CV Analiz Raporu</h1>
            <p><strong>Aday:</strong> ${candidateName}</p>
            <p><strong>Pozisyon:</strong> ${jobTitle}</p>
            <p><strong>Tarih:</strong> ${moment().format('DD.MM.YYYY HH:mm')}</p>
        </div>
        
        <div class="score-display">
            Genel Uygunluk Skoru: ${analysisData.overall_score}/100
        </div>
        
        <div class="section">
            <h2>Beceri Analizi</h2>
            <div class="skills-grid">
                <div class="skill-category">
                    <h3>Eşleşen Beceriler (${(analysisData.matched_skills || []).length})</h3>
                    <ul class="skill-list matched-skills">
                        ${(analysisData.matched_skills || []).map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
                <div class="skill-category">
                    <h3>Kısmi Beceriler (${(analysisData.partial_skills || []).length})</h3>
                    <ul class="skill-list partial-skills">
                        ${(analysisData.partial_skills || []).map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
                <div class="skill-category">
                    <h3>Eksik Beceriler (${(analysisData.missing_skills || []).length})</h3>
                    <ul class="skill-list missing-skills">
                        ${(analysisData.missing_skills || []).map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Genel Değerlendirme</h2>
            <div class="strengths-weaknesses">
                <div class="strengths">
                    <h3>Güçlü Yönler</h3>
                    <ul>
                        ${(analysisData.strengths || []).map(strength => `<li>${strength}</li>`).join('')}
                    </ul>
                </div>
                <div class="weaknesses">
                    <h3>Geliştirilmesi Gereken Alanlar</h3>
                    <ul>
                        ${(analysisData.weaknesses || []).map(weakness => `<li>${weakness}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Deneyim Seviyesi</h2>
            <p><strong>Belirlenen Seviye:</strong> ${analysisData.experience_level}</p>
            <p><strong>Eğitim Uygunluğu:</strong> ${analysisData.education_match ? 'Uygun' : 'Uygun Değil'}</p>
            <p><strong>Dil Becerileri:</strong> ${(analysisData.language_skills || []).join(', ')}</p>
        </div>
        
        <div class="section">
            <h2>ATS Geri Bildirimi</h2>
            <ul>
                ${(analysisData.ats_feedback || []).map(feedback => `<li>${feedback}</li>`).join('')}
            </ul>
        </div>
        
        <div class="recommendation">
            <h3>Öneri</h3>
            <p>${analysisData.recommendation}</p>
        </div>
        
        <div class="section">
            <h2>Özet</h2>
            <p>${analysisData.summary}</p>
        </div>
        
        <div class="footer">
            <p>Bu rapor AI destekli CV analiz sistemi tarafından otomatik olarak oluşturulmuştur.</p>
        </div>
    </body>
    </html>
    `;
    
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
            top: '20mm',
            right: '20mm',
            bottom: '20mm',
            left: '20mm'
        }
    });
    
    await browser.close();
    return pdfBuffer;
}

// Routes

// CV Upload
app.post('/api/cv/upload', upload.single('cv'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'CV file is required' });
        }

        const referenceCode = 'CND-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 1000000);
        
        // Extract text from CV
        let cvText = '';
        const filePath = req.file.path;
        
        try {
            if (req.file.mimetype === 'application/pdf') {
                cvText = await extractTextFromPDF(filePath);
            } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                cvText = await extractTextFromDOCX(filePath);
            } else if (req.file.mimetype === 'text/plain') {
                cvText = fs.readFileSync(filePath, 'utf8');
            }
            
            // Check if text extraction was successful
            if (!cvText || cvText.trim().length === 0) {
                console.log('No text extracted from file, using filename as fallback');
                cvText = 'Metin çıkarılamadı - dosya adı: ' + req.file.originalname;
            }
        } catch (extractError) {
            console.error('Text extraction error:', extractError);
            cvText = 'Metin çıkarılamadı - dosya adı: ' + req.file.originalname;
        }

        // Use filename as candidate name (remove extension)
        let candidateName = req.file.originalname;
        
        // Remove file extension
        const lastDotIndex = candidateName.lastIndexOf('.');
        if (lastDotIndex > 0) {
            candidateName = candidateName.substring(0, lastDotIndex);
        }
        
        // Replace underscores and hyphens with spaces
        candidateName = candidateName.replace(/[_-]/g, ' ');
        
        console.log('Using filename as candidate name:', candidateName);

        // Save to database
        db.run(
            'INSERT INTO candidates (candidate_id, name, cv_file_path, cv_text) VALUES (?, ?, ?, ?)',
            [referenceCode, candidateName, req.file.path, cvText],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to save candidate' });
                }
                
                res.json({
                    success: true,
                    referenceCode: referenceCode,
                    candidateName: candidateName,
                    message: 'CV başarıyla yüklendi'
                });
            }
        );

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'CV upload failed' });
    }
});

// HR Login
app.post('/api/hr/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM hr_users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    });
});

// Get jobs
app.get('/api/hr/jobs', authenticateToken, (req, res) => {
    db.all('SELECT * FROM jobs ORDER BY created_at DESC', (err, jobs) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(jobs);
    });
});

// Create job
app.post('/api/hr/jobs', authenticateToken, (req, res) => {
    const { title, description, requirements, location, department, experience_level, employment_type, salary_range } = req.body;

    db.run(
        'INSERT INTO jobs (title, description, requirements, location, department, experience_level, employment_type, salary_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, description, requirements, location, department, experience_level, employment_type, salary_range],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create job' });
            }
            res.json({ id: this.lastID, message: 'Job created successfully' });
        }
    );
});

// Get candidates
app.get('/api/hr/candidates', authenticateToken, (req, res) => {
    db.all('SELECT * FROM candidates ORDER BY uploaded_at DESC', (err, candidates) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(candidates);
    });
});

// Get single candidate
app.get('/api/hr/candidates/:id', authenticateToken, (req, res) => {
    const candidateId = req.params.id;
    
    db.get('SELECT * FROM candidates WHERE id = ?', [candidateId], (err, candidate) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!candidate) {
            return res.status(404).json({ error: 'Aday bulunamadı' });
        }
        
        res.json(candidate);
    });
});

// Download CV file
app.get('/api/hr/candidates/:id/download', authenticateToken, (req, res) => {
    const candidateId = req.params.id;
    
    db.get('SELECT cv_file_path, name FROM candidates WHERE id = ?', [candidateId], (err, candidate) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!candidate) {
            return res.status(404).json({ error: 'Aday bulunamadı' });
        }
        
        const filePath = candidate.cv_file_path;
        const fileName = `${candidate.name || 'CV'}.pdf`;
        
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ error: 'Dosya indirilemedi' });
            }
        });
    });
});

// Update candidate tag
app.put('/api/hr/candidates/:candidateId/tag', authenticateToken, (req, res) => {
    const { candidateId } = req.params;
    const { tag } = req.body;
    
    db.run(
        'UPDATE candidates SET tag = ? WHERE id = ?',
        [tag, candidateId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Etiket güncellenemedi' });
            }
            res.json({ success: true });
        }
    );
});

// Update candidate (name and tag)
app.put('/api/hr/candidates/:id', authenticateToken, (req, res) => {
    const candidateId = req.params.id;
    const { name, tag } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Ad soyad boş olamaz' });
    }
    
    db.run(
        'UPDATE candidates SET name = ?, tag = ? WHERE id = ?',
        [name.trim(), tag || 'Beklemede', candidateId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Aday güncellenemedi' });
            }
            
            res.json({ success: true });
        }
    );
});

// Analyze CV
app.post('/api/hr/analyze', authenticateToken, async (req, res) => {
    try {
        const { candidateId, jobId } = req.body;

        // Get candidate details
        const candidate = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM candidates WHERE id = ?', [candidateId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!candidate) {
            return res.status(404).json({ error: 'Aday bulunamadı' });
        }

        // Get job details if provided, otherwise use default
        let job = null;
        if (jobId) {
            job = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM jobs WHERE id = ?', [jobId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }

        // If no job specified, use a generic analysis
        if (!job) {
            job = {
                title: 'Genel Pozisyon',
                description: 'Genel iş pozisyonu için değerlendirme',
                requirements: 'Genel iş becerileri ve deneyim - Spesifik pozisyon belirtilmediği için düşük puanlama uygulanacak'
            };
        }

        // Extract text from CV
        const cvPath = candidate.cv_file_path;
        let cvText = '';
        
        if (cvPath.endsWith('.pdf')) {
            cvText = await extractTextFromPDF(cvPath);
        } else if (cvPath.endsWith('.docx')) {
            cvText = await extractTextFromDOCX(cvPath);
        }

        // Get analysis prompt
        const prompt = getCVAnalysisPrompt(cvText, job.title, job.description, job.requirements);

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are an expert HR analyst and ATS system. You must respond ONLY with valid JSON. No explanations, no markdown, no extra text."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 2000,
            temperature: 0.1
        });

        const analysisResult = completion.choices[0].message.content;
        
        // Parse JSON response
        let analysisData;
        try {
            analysisData = JSON.parse(analysisResult);
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('AI analiz yanıtı işlenemedi');
        }

        // Generate PDF report
        const pdfBuffer = await generatePDFReport(analysisData, candidate.name, job.title);
        
        // Save PDF report
        const reportsDir = 'uploads/reports';
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const pdfFilename = `${candidate.name.replace(/\s+/g, '_')}_${job.title.replace(/\s+/g, '_')}_CVAnalizi_${moment().format('YYYYMMDD-HHmm')}.pdf`;
        const pdfPath = path.join(reportsDir, pdfFilename);
        fs.writeFileSync(pdfPath, pdfBuffer);

        // Save analysis to database
        db.run(
            'INSERT INTO analysis_reports (candidate_id, job_id, analysis_result, pdf_filename) VALUES (?, ?, ?, ?)',
            [candidateId, jobId, JSON.stringify(analysisData), pdfFilename],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to save analysis' });
                }
                
                res.json({
                    success: true,
                    analysisId: this.lastID,
                    pdfFilename: pdfFilename,
                    analysisData: analysisData,
                    message: 'CV analizi tamamlandı'
                });
            }
        );

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'CV analysis failed' });
    }
});

// Get single job
app.get('/api/hr/jobs/:id', authenticateToken, (req, res) => {
    const jobId = req.params.id;
    
    db.get('SELECT * FROM jobs WHERE id = ?', [jobId], (err, job) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        
        res.json(job);
    });
});

// Get reports
app.get('/api/hr/reports', authenticateToken, (req, res) => {
    const { search, tags, scores } = req.query;
    
    let query = `
        SELECT ar.*, c.name as candidate_name, j.title as job_title, c.tag
        FROM analysis_reports ar
        LEFT JOIN candidates c ON ar.candidate_id = c.id
        LEFT JOIN jobs j ON ar.job_id = j.id
    `;
    
    const conditions = [];
    const params = [];
    
    // Search filter
    if (search) {
        conditions.push(`(c.name LIKE ? OR c.candidate_id LIKE ? OR j.title LIKE ?)`);
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Tag filter (multiple selection)
    if (tags) {
        const tagList = tags.split(',').map(tag => `'${tag.trim()}'`).join(',');
        conditions.push(`c.tag IN (${tagList})`);
    }
    
    // Score filter (multiple selection)
    if (scores) {
        const scoreConditions = [];
        const scoreRanges = scores.split(',');
        
        scoreRanges.forEach(range => {
            const [min, max] = range.trim().split('-').map(Number);
            if (min !== undefined && max !== undefined) {
                scoreConditions.push(`(JSON_EXTRACT(ar.analysis_result, '$.overall_score') BETWEEN ${min} AND ${max})`);
            }
        });
        
        if (scoreConditions.length > 0) {
            conditions.push(`(${scoreConditions.join(' OR ')})`);
        }
    }
    
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY ar.created_at DESC`;
    
    db.all(query, params, (err, reports) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(reports);
    });
});

// Get single report
app.get('/api/hr/reports/:id', authenticateToken, (req, res) => {
    const reportId = req.params.id;
    
    let query = `
        SELECT ar.*, c.name as candidate_name, j.title as job_title, c.tag
        FROM analysis_reports ar
        LEFT JOIN candidates c ON ar.candidate_id = c.id
        LEFT JOIN jobs j ON ar.job_id = j.id
        WHERE ar.id = ?
    `;
    
    db.get(query, [reportId], (err, report) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json(report);
    });
});

// Download report
app.get('/api/hr/reports/:id/download', authenticateToken, (req, res) => {
    const reportId = req.params.id;
    
    db.get('SELECT * FROM analysis_reports WHERE id = ?', [reportId], (err, report) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        const pdfPath = path.join('uploads/reports', report.pdf_filename);
        
        if (!fs.existsSync(pdfPath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }
        
        res.download(pdfPath, report.pdf_filename);
    });
});

// Delete candidate
app.delete('/api/hr/candidates/:id', authenticateToken, (req, res) => {
    const candidateId = req.params.id;
    
    // First get candidate info to delete CV file
    db.get('SELECT cv_file_path FROM candidates WHERE id = ?', [candidateId], (err, candidate) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }
        
        // Delete candidate from database
        db.run('DELETE FROM candidates WHERE id = ?', [candidateId], function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Candidate could not be deleted' });
            }
            
            // Delete CV file
            if (candidate.cv_file_path && fs.existsSync(candidate.cv_file_path)) {
                fs.unlinkSync(candidate.cv_file_path);
            }
            
            res.json({ success: true, message: 'Candidate deleted successfully' });
        });
    });
});

// Delete job
app.delete('/api/hr/jobs/:id', authenticateToken, (req, res) => {
    const jobId = req.params.id;
    
    db.run('DELETE FROM jobs WHERE id = ?', [jobId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Job could not be deleted' });
        }
        
        res.json({ success: true, message: 'Job deleted successfully' });
    });
});

// Delete report
app.delete('/api/hr/reports/:id', authenticateToken, (req, res) => {
    const reportId = req.params.id;
    
    // First get report info to delete PDF file
    db.get('SELECT pdf_filename FROM analysis_reports WHERE id = ?', [reportId], (err, report) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Delete report from database
        db.run('DELETE FROM analysis_reports WHERE id = ?', [reportId], function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Report could not be deleted' });
            }
            
            // Delete PDF file
            if (report.pdf_filename) {
                const pdfPath = path.join('uploads/reports', report.pdf_filename);
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            }
            
            res.json({ success: true, message: 'Report deleted successfully' });
        });
    });
});

// Update job
app.put('/api/hr/jobs/:id', authenticateToken, (req, res) => {
    const jobId = req.params.id;
    const { title, description, requirements, location, department, experience_level, employment_type, salary_range } = req.body;
    
    db.run(
        'UPDATE jobs SET title = ?, description = ?, requirements = ?, location = ?, department = ?, experience_level = ?, employment_type = ?, salary_range = ? WHERE id = ?',
        [title, description, requirements, location, department, experience_level, employment_type, salary_range, jobId],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Job could not be updated' });
            }
            
            res.json({ success: true, message: 'Job updated successfully' });
        }
    );
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
    console.log(`HR Panel: http://localhost:${PORT}/ik/login.html`);
});
