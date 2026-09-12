const path = require('path');
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'innovation-center-local-secret';
const registrations = [];
const studentSchema = new mongoose.Schema({
  name: String,
  schoolId: { type: String, unique: true, sparse: true },
  email: String,
  phone: String,
  department: String,
  interests: String,
  projectIdea: String,
  pastProjects: String,
  contributionReason: String,
  projectDetails: String,
  teamworkExperience: String,
  motivation: String,
  skills: String,
  innovationDomain: String,
  leadershipExperience: String,
  collaborationStyle: String,
  timeCommitment: String,
  mentorshipInterest: Boolean,
  eventPresentation: Boolean,
  publicationExperience: String,
  languages: String,
  internationalCollaboration: String,
  entrepreneurshipInterest: Boolean,
  technicalKnowledge: String,
  communicationPlatform: String,
  competitionExperience: String,
  innovationStrengths: String,
  improvementAreas: String,
  careerGoals: String,
  communityImpact: String,
  policyAgreement: Boolean,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });
const Student = mongoose.model('Student', studentSchema);

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

  if (mongoose.connection.readyState === 1) {
    try {
      await Student.create(registration);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'That School ID is already registered.' });
      return res.status(500).json({ message: 'Registration could not be saved.' });
    }
  } else {
    if (registration.schoolId && registrations.some((student) => student.schoolId === registration.schoolId)) {
      return res.status(409).json({ message: 'That School ID is already registered.' });
    }
    registrations.push(registration);
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

app.get('/students', requireAdmin, async (_req, res) => {
  const students = mongoose.connection.readyState === 1 ? await Student.find().sort({ createdAt: -1 }).lean() : registrations;
  res.json(students);
});

app.get('/students/export', requireAdmin, async (_req, res) => {
  const students = mongoose.connection.readyState === 1 ? await Student.find().sort({ createdAt: -1 }).lean() : registrations;
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

app.listen(port, () => {
  console.log(`Innovation Center running at http://localhost:${port}`);
  if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('Connected to MongoDB Atlas'))
      .catch((error) => console.error(`MongoDB unavailable; using local fallback: ${error.message}`));
  }
});
