const path = require('path');
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'innovation-center-local-secret';
const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL || '';
const registrations = [];
const pendingSchoolIds = new Set();

function reserveRegistration(registration) {
  const schoolId = typeof registration.schoolId === 'string' ? registration.schoolId.trim() : '';
  const duplicateExists = schoolId && (
    pendingSchoolIds.has(schoolId) ||
    registrations.some((student) => {
      const existingSchoolId = typeof student.schoolId === 'string' ? student.schoolId.trim() : '';
      return existingSchoolId === schoolId;
    })
  );

  if (duplicateExists) {
    throw new Error('That School ID is already registered.');
  }

  if (schoolId) pendingSchoolIds.add(schoolId);
  return schoolId;
}

function saveRegistration(registration) {
  registrations.push(registration);
}

function getStudentsFromSource() {
  return [...registrations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function sendToGoogleSheet(registration) {
  if (!googleScriptUrl) {
    throw new Error('Google Sheets is not configured.');
  }

  const response = await fetch(googleScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Sheets returned HTTP ${response.status}.`);
  }

  if (!text.trim() || (response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('Google Sheets did not confirm the registration.');
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = null;
  }

  if (
    result?.success === false ||
    result?.ok === false ||
    String(result?.status || '').toLowerCase() === 'error' ||
    result?.error ||
    /^(error|failed)\b/i.test(text.trim())
  ) {
    throw new Error('Google Sheets rejected the registration.');
  }

  console.log('Registration synced to Google Sheets.');
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/register', async (req, res) => {
  const { name, schoolId, email, phone, department, interests, projectIdea, contributionReason, projectDetails, teamworkExperience, policyAgreement } = req.body;
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const hasApplicantFields = Boolean(
    trimmedName &&
    (schoolId || req.body.universityId) &&
    trimmedEmail &&
    /^\S+@\S+\.\S+$/.test(trimmedEmail) &&
    (phone || req.body.phoneNumber) &&
    (req.body.projectTitle || req.body.projectIdea || req.body.whyJoin || req.body.skills)
  );
  const isFullRegistration = Boolean(trimmedName && schoolId && trimmedEmail && /^\S+@\S+\.\S+$/.test(trimmedEmail) && phone && phone.toString().replace(/\D/g, '').length >= 7 && projectIdea && contributionReason && projectDetails && teamworkExperience && policyAgreement === true);
  const isQuickRegistration = Boolean(trimmedName && trimmedEmail && department && interests && policyAgreement === true);

  if (!hasApplicantFields && !isFullRegistration && !isQuickRegistration) {
    return res.status(400).json({ message: 'Complete all required fields, use a valid email and phone number, and accept the policies.' });
  }

  const registration = {
    id: Date.now().toString(),
    name: trimmedName,
    schoolId: typeof schoolId === 'string' ? schoolId.trim() : '',
    email: trimmedEmail,
    phone: typeof phone === 'string' ? phone.trim() : (phone ? String(phone) : ''),
    department: typeof department === 'string' ? department.trim() : '',
    interests: typeof interests === 'string' ? interests.trim() : '',
    ...req.body,
    createdAt: new Date().toISOString()
  };

  let reservedSchoolId = '';
  try {
    reservedSchoolId = reserveRegistration(registration);
    await sendToGoogleSheet(registration);
    saveRegistration(registration);
  } catch (error) {
    if (error.message === 'That School ID is already registered.') {
      return res.status(409).json({ message: error.message });
    }
    console.error('Registration persistence failed:', error.message);
    return res.status(502).json({ message: 'Your application could not be saved to Google Sheets. Please try again later.' });
  } finally {
    if (reservedSchoolId) pendingSchoolIds.delete(reservedSchoolId);
  }

  res.status(201).json({ message: 'Registration received. Welcome to the Innovation Center.' });
});

app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@innovation.center';
  const adminPassword = process.env.ADMIN_PASSWORD || 'center-admin';
  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ message: 'Invalid admin credentials.' });
  }
  res.json({ token: jwt.sign({ role: 'admin', email }, jwtSecret, { expiresIn: '2h' }) });
});

function requireAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    req.admin = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Admin authentication required.' });
  }
}

app.get('/students', requireAdmin, (_req, res) => {
  res.json(getStudentsFromSource());
});

app.get('/students/export', requireAdmin, (_req, res) => {
  const students = getStudentsFromSource();
  const keys = Array.from(new Set(students.flatMap((student) => Object.keys(student)))).sort();
  const escapeCsv = (value) => {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };
  const header = keys.map(escapeCsv).join(',');
  const rows = students.map((student) => keys.map((key) => escapeCsv(student[key])).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="student-registrations.csv"');
  res.send(`${header}\n${rows}`);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Innovation Center running at http://localhost:${port}`);
    console.log(googleScriptUrl ? 'Google Sheets persistence is configured.' : 'Google Sheets persistence is not configured.');
  });
}

module.exports = app;
