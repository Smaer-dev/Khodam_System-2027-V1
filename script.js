
import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBncCf-PVK6PzEYR09zDryD3ObgpxS2gpE",
  authDomain: "khodam-27-v2.firebaseapp.com",
  projectId: "khodam-27-v2",
  storageBucket: "khodam-27-v2.firebasestorage.app",
  messagingSenderId: "84798945598",
  appId: "1:84798945598:web:b0e8f519e54338585bd46f",
  measurementId: "G-J3C5HGZ2GC"
};

const firebaseApp = initializeApp(firebaseConfig);
const studentRegistrationApp = initializeApp(firebaseConfig, 'student-registration');
const db = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});
const auth = getAuth(firebaseApp);
const studentRegistrationAuth = getAuth(studentRegistrationApp);
isSupported().then(supported => { if (supported) getAnalytics(firebaseApp); }).catch(() => {});

const COLLECTIONS = {
  STUDENTS: 'students', SERVANTS: 'servants', ADMINS: 'admins',
  ATTENDANCE: 'attendance', PREPARATIONS: 'preparations', COURSEWORK: 'coursework',
  COMPETITIONS: 'competitions', EVALUATIONS: 'coursework', EXAMS: 'exams',
  SETTINGS: 'settings', VISITATION_NOTES: 'visitation_notes', LOGS: 'logs',
  SPIRITUAL_DAILY: 'spiritualDailyRecords', SPIRITUAL_MONTHLY: 'spiritualMonthlyNotes',
  BOOKS: 'books', SUBJECTS: 'subjects', ACADEMIC_YEARS: 'academicYears',
  BATCHES: 'batches', TERMS: 'terms', LECTURES: 'lectures', WEEKS: 'weeks',
  ACTIVE_SESSIONS: 'activeSessions', LOGS_AUDIT: 'auditLogs'
};

const STAGES_DEFAULT = ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'شباب', 'خريجين', 'أولياء أمور'];
const STUDY_BOOKS = ['الكتاب الأول', 'الكتاب الثاني', 'الكتاب الثالث', 'الكتاب الرابع'];
const STUDENT_STATUSES = ['نشط', 'ناجح', 'راسب', 'مؤجل', 'منقطع', 'عائد', 'مستكمل', 'خريج', 'مستمع'];
const CLASS_GROUPS_DEFAULT = ['تمهيدي', 'أولى وثانية', 'ثالثة ورابعة', 'خامسة وسادسة', 'إعدادي - ثانوي', 'شباب وخريجين'];
const CLASS_LETTERS = ['A','B','C','D','E','F'];
const CURRICULUM_SUBJECTS_DEFAULT = [
  { id: 'ritual-theology', value: 'ritual-theology', label: 'اللاهوت الطقسي', icon: '⛪', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'doctrinal-theology', value: 'doctrinal-theology', label: 'اللاهوت العقيدي', icon: '✝️', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'church-history', value: 'church-history', label: 'تاريخ الكنيسة', icon: '🏛️', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'human-development', value: 'human-development', label: 'التنمية البشرية', icon: '🌱', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'psychology', value: 'psychology', label: 'علم النفس', icon: '🧠', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'bible', value: 'bible', label: 'الكتاب المقدس', icon: '📖', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'pastoral-theology', value: 'pastoral-theology', label: 'اللاهوت الرعوي', icon: '🕊️', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 },
  { id: 'comparative-theology', value: 'comparative-theology', label: 'اللاهوت المقارن', icon: '⚖️', books: ['الكتاب الأول', 'الكتاب الثالث'], countInTotal: true, competition: true, examQuestions: 30 }
];

const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'partial', 'excused', 'cancelled'];
const ATTENDANCE_POLICY_DEFAULT = {
  eligibilityPercent: 65,
  warningInterrupted: 7,
  warningConsecutive: 4,
  attendanceWeight: 50,
  questionsWeight: 50,
  lecture1: { quarterAfter: '18:30', absenceAt: '19:00' },
  lecture2: { quarterAfter: '19:30', absenceAt: '20:00' },
  compareBoundary: 'after' // strict boundary belongs to the later period
};

const AttendanceEngine = {
  policy() {
    return { ...ATTENDANCE_POLICY_DEFAULT, ...(AppData.settings.attendancePolicy || {}), lecture1: { ...ATTENDANCE_POLICY_DEFAULT.lecture1, ...(AppData.settings.attendancePolicy?.lecture1 || {}) }, lecture2: { ...ATTENDANCE_POLICY_DEFAULT.lecture2, ...(AppData.settings.attendancePolicy?.lecture2 || {}) } };
  },
  statusLabel(status) {
    return { present: 'حاضر', late: 'متأخر', absent: 'غائب', partial: 'غياب جزئي', excused: 'غياب بعذر', cancelled: 'ملغاة/غير منعقدة' }[status] || status;
  },
  calculate(records, studentId) {
    const policy = this.policy();
    const studentRecords = records.filter(r => String(r.studentId) === String(studentId) && r.type !== 'visitation' && r.status !== 'cancelled');
    const counted = studentRecords.filter(r => r.status !== 'cancelled');
    const present = studentRecords.filter(r => ['present', 'late'].includes(r.status)).length;
    const partial = studentRecords.filter(r => r.status === 'partial').length;
    const attendanceUnits = present + partial * 0.5;
    const percentage = counted.length ? Math.round(attendanceUnits / counted.length * 1000) / 10 : 0;
    const eligible = percentage > policy.eligibilityPercent;
    const weeks = [...new Set(studentRecords.map(r => r.studyDay || r.week).filter(Boolean))];
    let consecutiveAbsentDays = 0;
    let interruptedAbsences = 0;
    [...weeks].sort((a, b) => a - b).forEach(week => {
      const dayRecords = studentRecords.filter(r => (r.studyDay || r.week) === week);
      const fullAbsence = dayRecords.length > 0 && dayRecords.every(r => ['absent'].includes(r.status));
      if (fullAbsence) consecutiveAbsentDays++;
      else consecutiveAbsentDays = 0;
    });
    interruptedAbsences = [...new Set(studentRecords.filter(r => r.status === 'absent' && r.studyDay || r.status === 'absent' && r.week).map(r => r.studyDay || r.week))].length;
    return {
      percentage, eligible: eligible ? 'مؤهل' : 'غير مؤهل',
      total: counted.length,
      present: present + partial,
      partial,
      interruptedAbsences,
      consecutiveAbsentDays,
      remainingInterrupted: Math.max(0, policy.warningInterrupted - interruptedAbsences),
      remainingConsecutive: Math.max(0, policy.warningConsecutive - consecutiveAbsentDays),
      needsWarning: interruptedAbsences >= policy.warningInterrupted || consecutiveAbsentDays >= policy.warningConsecutive
    };
  },
  getStatusByArrival(arrivalTime, lectureNumber) {
    const policy = this.policy();
    const rules = lectureNumber === 2 ? policy.lecture2 : policy.lecture1;
    if (!arrivalTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) return null;
    if (arrivalTime < rules.quarterAfter) return 'present';
    if (arrivalTime < rules.absenceAt) return 'late';
    return 'absent';
  }
};

function normalizeSubject(subject) {
  const safeBooks = Array.isArray(subject.books) ? subject.books.filter(book => STUDY_BOOKS.includes(book)) : [];
  const value = String(subject.value || subject.id || subject.label || '').trim().toLowerCase().replace(/\s+/g, '-');
  return {
    id: String(subject.id || value),
    value: String(subject.value || value),
    label: String(subject.label || subject.name || 'مادة جديدة'),
    icon: String(subject.icon || '📚'),
    books: safeBooks.length ? safeBooks : ['الكتاب الأول', 'الكتاب الثالث'],
    countInTotal: subject.countInTotal !== false,
    competition: subject.competition !== false,
    examQuestions: Math.max(1, parseInt(subject.examQuestions) || 30)
  };
}

/* ============================================================
   نظام الدرجات
   ============================================================ */
const GRADING_SYSTEM = {
  regular: { attendance: 20, evaluations: 30, exam: 50, total: 100 },
  hymns: { attendance: 20, evaluations: 20, exam: 60, total: 100 },
  getWeights(subject) { return subject === 'hymns' ? this.hymns : this.regular; },
  calculateSubjectGrade(studentId, subject, totalWeeks, totalEvaluations) {
    const weights = this.getWeights(subject);
    let attRecords = AppData.attendance.filter(a => a.studentId === studentId && a.type !== 'visitation' && a.subject === subject);
    if (attRecords.length === 0) attRecords = AppData.attendance.filter(a => a.studentId === studentId && a.type !== 'visitation');
    const presentCount = attRecords.filter(a => a.status === 'present').length;
    const attendancePercent = totalWeeks > 0 ? presentCount / totalWeeks : 0;
    const attendanceScore = Math.round(attendancePercent * weights.attendance * 100) / 100;
    const evals = AppData.evaluations.filter(e => e.studentId === studentId && e.subject === subject);
    let evalScore = 0;
    if (totalEvaluations > 0) {
      const evalTotal = evals.reduce((sum, e) => sum + (e.score || 0), 0);
      const maxEvalTotal = 10 * totalEvaluations;
      const evalPercent = maxEvalTotal > 0 ? evalTotal / maxEvalTotal : 0;
      evalScore = Math.round(evalPercent * weights.evaluations * 100) / 100;
    }
    const exam = AppData.exams.find(e => e.studentId === studentId && e.subject === subject);
    const examScore = exam ? (exam.score || 0) : 0;
    return {
      attendanceScore, attendancePresent: presentCount, attendanceTotal: totalWeeks,
      evalScore, evalCount: evals.length, examScore, examMax: weights.exam,
      total: Math.round((attendanceScore + evalScore + examScore) * 100) / 100, weights
    };
  },
  getGradeLetter(score) {
    if (score >= 90) return { letter: 'A', label: 'ممتاز', color: '#2e7d32' };
    if (score >= 80) return { letter: 'B', label: 'جيد جدًا', color: '#1976d2' };
    if (score >= 70) return { letter: 'C', label: 'جيد', color: '#f9a825' };
    if (score >= 60) return { letter: 'D', label: 'مقبول', color: '#e65100' };
    return { letter: 'F', label: 'ضعيف', color: '#c62828' };
  }
};

const CodeGenerator = {
  SERVANT_PATTERN: /^A[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/,
  STUDENT_PATTERN: /^S[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/,
  LETTERS: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  generateCode(prefix) {
    const rl = () => this.LETTERS[Math.floor(Math.random() * this.LETTERS.length)];
    const rd = () => Math.floor(10 + Math.random() * 90).toString();
    return `${prefix}${rl()}${rd()}${rl()}${rl()}${rd()}`;
  },
  generateServantCode() { return this.generateCode('A'); },
  generateStudentCode() { return this.generateCode('S'); },
  isValidServantCode(code) { return this.SERVANT_PATTERN.test(code); },
  isValidStudentCode(code) { return this.STUDENT_PATTERN.test(code); },
  generateUniqueCode(prefix, existingCodes = new Set(), maxAttempts = 1000) {
    for (let i = 0; i < maxAttempts; i++) {
      const code = this.generateCode(prefix);
      if (!existingCodes.has(code)) return code;
    }
    throw new Error('فشل توليد كود فريد');
  }
};

const AuthManager = {
  currentUid: null, ready: false,
  async init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) this.currentUid = user.uid;
        else this.currentUid = null;
        this.ready = true;
        resolve(this.currentUid);
      });
    });
  }
};

const ConnectionState = {
  isOnline: true,
  init() { window.addEventListener('online', () => this.update(true)); window.addEventListener('offline', () => this.update(false)); this.update(navigator.onLine); },
  update(online) {
    this.isOnline = online;
    const badge = document.getElementById('fbStatus');
    if (!badge) return;
    badge.className = online ? 'fb-status online' : 'fb-status offline';
    badge.textContent = online ? '🟢 متصل بـ Firebase' : '🔴 غير متصل';
  },
  setSyncing() {
    const badge = document.getElementById('fbStatus');
    if (badge) { badge.className = 'fb-status syncing'; badge.textContent = '⏳ جارٍ المزامنة...'; }
  }
};

/* ============================================================
   Device Fingerprint
   ============================================================ */
function getDeviceFingerprint() {
  let fingerprint = localStorage.getItem('habib_device_fp');
  if (!fingerprint) {
    const nav = window.navigator;
    const screen = window.screen;
    const data = [
      nav.userAgent, nav.language, screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 'unknown',
      nav.platform || 'unknown'
    ].join('|');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    fingerprint = 'dev_' + Math.abs(hash).toString(36);
    localStorage.setItem('habib_device_fp', fingerprint);
  }
  return fingerprint;
}

/* ============================================================
   Session Tracker
   ============================================================ */
const SessionTracker = {
  currentSessionId: null,
  heartbeatInterval: null,
  unsubscribe: null,
  deviceFingerprint: null,

  generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  async startSession(user) {
    try {
      this.deviceFingerprint = getDeviceFingerprint();
      this.currentSessionId = this.generateSessionId();
      
      await setDoc(doc(db, COLLECTIONS.ACTIVE_SESSIONS, this.currentSessionId), {
        sessionId: this.currentSessionId,
        userType: user.type,
        userId: user.data.id || user.data.username || user.data.uid,
        userName: user.data.name || 'غير محدد',
        userCode: user.data.code || user.data.id || '',
        userRole: user.type,
        roles: Helpers.getServantAdminRoles(user.data),
        classes: Helpers.getServantClassGroups(user.data),
        device: navigator.userAgent,
        deviceFingerprint: this.deviceFingerprint,
        deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? '📱 جوال' : '💻 كمبيوتر',
        loginAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isActive: true
      }, { merge: true });

      localStorage.setItem('habib_session_id', this.currentSessionId);
      this.startHeartbeat();
      console.log('✅ Session started:', this.currentSessionId);
    } catch (e) { console.error('Failed to start session:', e); }
  },

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(async () => {
      if (!this.currentSessionId) return;
      try {
        await updateDoc(doc(db, COLLECTIONS.ACTIVE_SESSIONS, this.currentSessionId), {
          lastSeen: new Date().toISOString(),
          isActive: true
        });
      } catch (e) {}
    }, 30000);
  },

  async endSession() {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    if (this.currentSessionId) {
      try {
        await updateDoc(doc(db, COLLECTIONS.ACTIVE_SESSIONS, this.currentSessionId), {
          isActive: false,
          logoutAt: new Date().toISOString()
        });
      } catch (e) {}
      localStorage.removeItem('habib_session_id');
      this.currentSessionId = null;
    }
  },

  async forceLogout(sessionId) {
    try {
      await updateDoc(doc(db, COLLECTIONS.ACTIVE_SESSIONS, sessionId), {
        isActive: false,
        forcedLogout: true,
        logoutAt: new Date().toISOString()
      });
      return true;
    } catch (e) { return false; }
  },

  isThisDevice(session) {
    if (!this.deviceFingerprint) this.deviceFingerprint = getDeviceFingerprint();
    return session.deviceFingerprint === this.deviceFingerprint;
  },

  startMonitoring(callback) {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onSnapshot(collection(db, COLLECTIONS.ACTIVE_SESSIONS), (snap) => {
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(sessions);
    });
  },

  isSessionActive(session) {
    if (!session.isActive) return false;
    return (Date.now() - new Date(session.lastSeen).getTime()) < 120000;
  },

  isSessionIdle(session) {
    if (!session.isActive) return false;
    const diff = Date.now() - new Date(session.lastSeen).getTime();
    return diff >= 120000 && diff < 300000;
  },

  async cleanupOldSessions() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.ACTIVE_SESSIONS));
      const batch = writeBatch(db);
      let count = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (Date.now() - new Date(data.lastSeen).getTime() > 300000) {
          batch.update(d.ref, { isActive: false });
          count++;
        }
      });
      if (count > 0) await batch.commit();
    } catch (e) {}
  }
};

/* ============================================================
   DB Layer
   ============================================================ */
const DB = {
  KEYS: { STUDENTS: 'habib_students', SERVANTS: 'habib_servants', ATTENDANCE: 'habib_attendance',
    EVALUATIONS: 'habib_evaluations', EXAMS: 'habib_exams', NOTES: 'habib_notes',
    LOGS: 'habib_logs', SETTINGS: 'habib_settings', SESSION: 'habib_session' },

  _cacheGet(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } },
  _cacheSet(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {} },

  async getStudents() {
    try {
      ConnectionState.setSyncing();
      const snap = await getDocs(collection(db, COLLECTIONS.STUDENTS));
      const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._cacheSet(this.KEYS.STUDENTS, students);
      ConnectionState.update(true);
      return students;
    } catch (e) { ConnectionState.update(false); return this._cacheGet(this.KEYS.STUDENTS); }
  },
  async addStudent(student) {
    if (!CodeGenerator.isValidStudentCode(student.id)) throw new Error('كود غير صالح');
    const allCodes = await this.getAllCodes();
    if (allCodes.has(student.id)) throw new Error('الكود مستخدم');
    await setDoc(doc(db, COLLECTIONS.STUDENTS, student.id), { ...student, uid: student.uid || AuthManager.currentUid, createdAt: serverTimestamp() });
    const cache = this._cacheGet(this.KEYS.STUDENTS); cache.push(student);
    this._cacheSet(this.KEYS.STUDENTS, cache);
  },
  async updateStudent(id, updates) {
    await updateDoc(doc(db, COLLECTIONS.STUDENTS, id), { ...updates, updatedAt: serverTimestamp() });
    const cache = this._cacheGet(this.KEYS.STUDENTS);
    const idx = cache.findIndex(s => s.id === id);
    if (idx !== -1) { cache[idx] = { ...cache[idx], ...updates }; this._cacheSet(this.KEYS.STUDENTS, cache); }
  },
  async deleteStudent(id) {
    await deleteDoc(doc(db, COLLECTIONS.STUDENTS, id));
    this._cacheSet(this.KEYS.STUDENTS, this._cacheGet(this.KEYS.STUDENTS).filter(s => s.id !== id));
  },
  async generateStudentCode() { return CodeGenerator.generateUniqueCode('S', await this.getAllCodes()); },

  async getServants() {
    try {
      ConnectionState.setSyncing();
      const snap = await getDocs(collection(db, COLLECTIONS.SERVANTS));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._cacheSet(this.KEYS.SERVANTS, data);
      ConnectionState.update(true);
      return data;
    } catch (e) { ConnectionState.update(false); return this._cacheGet(this.KEYS.SERVANTS); }
  },
  async addServant(s) {
    if (!CodeGenerator.isValidServantCode(s.code)) throw new Error('كود غير صالح');
    const allCodes = await this.getAllCodes();
    if (allCodes.has(s.code)) throw new Error('الكود مستخدم');
    await setDoc(doc(db, COLLECTIONS.SERVANTS, s.id), { ...s, uid: AuthManager.currentUid, createdAt: serverTimestamp() });
    const cache = this._cacheGet(this.KEYS.SERVANTS); cache.push(s);
    this._cacheSet(this.KEYS.SERVANTS, cache);
  },
  async updateServant(id, updates) {
    await updateDoc(doc(db, COLLECTIONS.SERVANTS, id), { ...updates, updatedAt: serverTimestamp() });
    const cache = this._cacheGet(this.KEYS.SERVANTS);
    const idx = cache.findIndex(s => s.id === id);
    if (idx !== -1) { cache[idx] = { ...cache[idx], ...updates }; this._cacheSet(this.KEYS.SERVANTS, cache); }
  },
  async deleteServant(id) {
    await deleteDoc(doc(db, COLLECTIONS.SERVANTS, id));
    this._cacheSet(this.KEYS.SERVANTS, this._cacheGet(this.KEYS.SERVANTS).filter(s => s.id !== id));
  },
  async generateServantCode() { return CodeGenerator.generateUniqueCode('A', await this.getAllCodes()); },
  async getAdmins() {
    try { const snap = await getDocs(collection(db, COLLECTIONS.ADMINS)); return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    catch { return []; }
  },
  async getAllCodes() {
    const codes = new Set();
    (await this.getStudents()).forEach(s => codes.add(s.id));
    (await this.getServants()).forEach(s => { if (s.code) codes.add(s.code); });
    return codes;
  },

  async getAttendance() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.ATTENDANCE));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._cacheSet(this.KEYS.ATTENDANCE, data);
      return data;
    } catch { return this._cacheGet(this.KEYS.ATTENDANCE); }
  },
  async saveAttendanceBulk(records) {
    const batch = writeBatch(db);
    records.forEach(r => {
      const lectureSuffix = r.lecture ? `_L${r.lecture}` : '';
      const docId = `${r.studentId}_W${r.week}_${r.type || 'attendance'}${lectureSuffix}`;
      batch.set(doc(db, COLLECTIONS.ATTENDANCE, docId), { ...r, recordedBy: AuthManager.currentUid, date: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  },

  async getVisitationNotes() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.VISITATION_NOTES));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._cacheSet(this.KEYS.NOTES, data);
      return data;
    } catch { return this._cacheGet(this.KEYS.NOTES); }
  },
  async addVisitationNote(note) {
    const ref = await addDoc(collection(db, COLLECTIONS.VISITATION_NOTES), { ...note, servantUid: AuthManager.currentUid, createdAt: serverTimestamp() });
    const saved = { id: ref.id, ...note };
    const cache = this._cacheGet(this.KEYS.NOTES); cache.push(saved);
    this._cacheSet(this.KEYS.NOTES, cache);
    return saved;
  },
  async updateVisitationNote(id, updates) {
    await updateDoc(doc(db, COLLECTIONS.VISITATION_NOTES, id), { ...updates, updatedAt: serverTimestamp() });
    const cache = this._cacheGet(this.KEYS.NOTES).map(n => n.id === id ? { ...n, ...updates } : n);
    this._cacheSet(this.KEYS.NOTES, cache);
  },
  async deleteVisitationNote(id) {
    await deleteDoc(doc(db, COLLECTIONS.VISITATION_NOTES, id));
    this._cacheSet(this.KEYS.NOTES, this._cacheGet(this.KEYS.NOTES).filter(n => n.id !== id));
  },

  async getEvaluations() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.EVALUATIONS));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return this._cacheGet(this.KEYS.EVALUATIONS); }
  },
  async saveEvaluationsBulk(records) {
    const batch = writeBatch(db);
    records.forEach(r => {
      const docId = `${r.studentId}_${r.subject}_W${r.week}`;
      batch.set(doc(db, COLLECTIONS.EVALUATIONS, docId), { ...r, recordedBy: AuthManager.currentUid, date: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  },

  async getExams() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.EXAMS));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return this._cacheGet(this.KEYS.EXAMS); }
  },
  async saveExamsBulk(records) {
    const batch = writeBatch(db);
    records.forEach(r => {
      const docId = `${r.studentId}_${r.subject}_${r.examType || 'final'}`;
      batch.set(doc(db, COLLECTIONS.EXAMS, docId), { ...r, recordedBy: AuthManager.currentUid, date: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  },

  async getLogs() {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.LOGS));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return this._cacheGet(this.KEYS.LOGS); }
  },
  async addLog(log) {
    try {
      await addDoc(collection(db, COLLECTIONS.LOGS), { ...log, user: State.currentUser?.data?.name || 'System', userId: AuthManager.currentUid, timestamp: serverTimestamp() });
    } catch (e) {}
  },

  async getSettings() {
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'main'));
      if (snap.exists()) { const d = snap.data(); this._cacheSet(this.KEYS.SETTINGS, d); return d; }
    } catch (e) {}
    const cached = this._cacheGet(this.KEYS.SETTINGS);
    if (cached && cached.termStart) return cached;
    return {
      centerName: 'نظام خدمة إعداد الخدام - كنيسة السيدة العذراء وماريوحنا الحبيب - فيصل',
      slogan: 'أفهم... صلّي... استمتع',
      termStart: '2025-09-01', termEnd: '2025-12-31',
      totalWeeks: 15, currentWeek: 1, totalEvaluations: 10,
      academicYear: '2025 / 2026', currentTerm: 'الترم الأول'
    };
  },
  async setSettings(data) {
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'main'), data, { merge: true });
    this._cacheSet(this.KEYS.SETTINGS, data);
  },

  getSession() { try { return JSON.parse(localStorage.getItem(this.KEYS.SESSION) || 'null'); } catch { return null; } },
  setSession(d) { localStorage.setItem(this.KEYS.SESSION, JSON.stringify(d)); },
  clearSession() { localStorage.removeItem(this.KEYS.SESSION); },

  listenToStudents(cb) { return onSnapshot(collection(db, COLLECTIONS.STUDENTS), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.STUDENTS, d); cb(d); }); },
  listenToServants(cb) { return onSnapshot(collection(db, COLLECTIONS.SERVANTS), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.SERVANTS, d); cb(d); }); },
  listenToAttendance(cb) { return onSnapshot(collection(db, COLLECTIONS.ATTENDANCE), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.ATTENDANCE, d); cb(d); }); },
  listenToEvaluations(cb) { return onSnapshot(collection(db, COLLECTIONS.EVALUATIONS), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.EVALUATIONS, d); cb(d); }); },
  listenToExams(cb) { return onSnapshot(collection(db, COLLECTIONS.EXAMS), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.EXAMS, d); cb(d); }); },
  listenToVisitationNotes(cb) { return onSnapshot(collection(db, COLLECTIONS.VISITATION_NOTES), snap => { const d = snap.docs.map(x => ({ id: x.id, ...x.data() })); this._cacheSet(this.KEYS.NOTES, d); cb(d); }); },

  async clearCollection(collectionName) {
    const batch = writeBatch(db);
    const snap = await getDocs(collection(db, collectionName));
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },
  async deleteAllStudents() { await this.clearCollection(COLLECTIONS.STUDENTS); },
  async deleteAllServants() { await this.clearCollection(COLLECTIONS.SERVANTS); },
  async deleteAllAttendance() { await this.clearCollection(COLLECTIONS.ATTENDANCE); },
  async deleteAllEvaluations() { await this.clearCollection(COLLECTIONS.EVALUATIONS); },
  async deleteAllExams() { await this.clearCollection(COLLECTIONS.EXAMS); },
  async deleteAllVisitationNotes() { await this.clearCollection(COLLECTIONS.VISITATION_NOTES); },
  async deleteAllLogs() { await this.clearCollection(COLLECTIONS.LOGS); }
};

const AppData = {
  students: [], servants: [], attendance: [], evaluations: [], exams: [],
  visitationNotes: [], logs: [], activeSessions: [],
  subjects: CURRICULUM_SUBJECTS_DEFAULT.map(subject => ({ ...subject })),
  stages: [...STAGES_DEFAULT],
  settings: {
    centerName: 'نظام خدمة إعداد الخدام - كنيسة السيدة العذراء وماريوحنا الحبيب - فيصل',
    slogan: 'أفهم... صلّي... استمتع',
    termStart: '2025-09-01', termEnd: '2025-12-31',
    totalWeeks: 15, currentWeek: 1, totalEvaluations: 10,
    academicYear: '2025 / 2026', currentTerm: 'الترم الأول'
  },

  async loadAll() {
    showLoading('جارٍ تحميل البيانات...');
    try {
      const [students, servants, attendance, notes, settings, evaluations, exams, logs] = await Promise.all([
        DB.getStudents(), DB.getServants(), DB.getAttendance(),
        DB.getVisitationNotes(), DB.getSettings(),
        DB.getEvaluations(), DB.getExams(), DB.getLogs()
      ]);
      Object.assign(this, { students, servants, attendance, visitationNotes: notes, settings, evaluations, exams, logs });
      this.subjects = Array.isArray(settings.subjects) && settings.subjects.length
        ? settings.subjects.map(normalizeSubject)
        : CURRICULUM_SUBJECTS_DEFAULT.map(subject => ({ ...subject }));
      this.startRealtimeListeners();
    } catch (e) { console.error(e); showToast('⚠️ فشل تحميل البيانات', 'error'); }
    finally { hideLoading(); }
  },

  startRealtimeListeners() {
    DB.listenToStudents(d => { this.students = d; if (State.currentPage === 'dashboard') renderApp(); });
    DB.listenToServants(d => { this.servants = d; if (State.currentPage === 'dashboard') renderApp(); });
    DB.listenToAttendance(d => { this.attendance = d; if (State.currentPage === 'dashboard') renderApp(); });
    DB.listenToEvaluations(d => { this.evaluations = d; if (State.currentPage === 'dashboard') renderApp(); });
    DB.listenToExams(d => { this.exams = d; if (State.currentPage === 'dashboard') renderApp(); });
    DB.listenToVisitationNotes(d => { this.visitationNotes = d; if (State.currentPage === 'dashboard') renderApp(); });
  }
};

const State = {
  currentPage: 'home', currentUser: null, activeTab: {}, sidebarOpen: false, classFilter: 'all', studyBookFilter: 'all', batchFilter: String(new Date().getFullYear()), graduateBatchFilter: 'all',
  setPage(page) { this.currentPage = page; renderApp(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  setUser(user) { this.currentUser = user; DB.setSession(user); renderApp(); },
  async logout() {
    await SessionTracker.endSession();
    this.currentUser = null;
    DB.clearSession();
    this.currentPage = 'home';
    renderApp();
    showToast('👋 تم تسجيل الخروج');
  },
  setTab(tab) { this.activeTab[this.currentPage] = tab; renderApp(); },
  getTab() { return this.activeTab[this.currentPage] || null; },
  setClassFilter(cls) { this.classFilter = cls; requestAnimationFrame(() => renderApp()); },
  setStudentFilter(key, value) { this[key] = value; requestAnimationFrame(() => renderApp()); }
};

const Helpers = {
  formatDate(d) { if (!d) return '—'; try { const dt = d.toDate ? d.toDate() : new Date(d); return dt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return '—'; } },
  formatDateTime(d) { if (!d) return '—'; try { const dt = d.toDate ? d.toDate() : new Date(d); return dt.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } },
  formatTimeAgo(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
      if (diff < 60) return 'منذ لحظات';
      if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
      if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
      return `منذ ${Math.floor(diff / 86400)} يوم`;
    } catch { return '—'; }
  },
  percentage(p, t) { return t === 0 ? 0 : Math.round((p / t) * 100); },
  getStages() { return AppData.stages.length > 0 ? AppData.stages : STAGES_DEFAULT; },
  getStudyBooks() { return STUDY_BOOKS; },
  getStudentStatuses() { return STUDENT_STATUSES; },
  getStudentStatusMeta(status) {
    const value = status || 'نشط';
    const meta = {
      'نشط': ['🟢', 'نشط', '#2e7d32'],
      'ناجح': ['✅', 'ناجح', '#1976d2'],
      'راسب': ['🔴', 'راسب', '#c62828'],
      'مؤجل': ['🟡', 'مؤجل', '#f57c00'],
      'منقطع': ['⚫', 'منقطع', '#616161'],
      'عائد': ['🔄', 'عائد', '#6a1b9a'],
      'مستكمل': ['📘', 'مستكمل', '#00838f'],
      'خريج': ['🎓', 'خريج', '#795548'],
      'مستمع': ['👂', 'مستمع', '#455a64']
    };
    return meta[value] || meta['نشط'];
  },
  studentStatusBadge(status) {
    const [icon, label, color] = this.getStudentStatusMeta(status);
    return `<span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}55;font-weight:700">${icon} ${label}</span>`;
  },
  getBatchYears(from = 2017) {
    const current = new Date().getFullYear() + 1;
    return Array.from({ length: current - from + 1 }, (_, i) => from + i).reverse();
  },
  getClassGroups() { return CLASS_GROUPS_DEFAULT; },
  getClassLetters() { return CLASS_LETTERS; },
  getSubjects() {
    const selectedBook = State.studyBookFilter;
    if (selectedBook && selectedBook !== 'all' && STUDY_BOOKS.includes(selectedBook)) {
      return AppData.subjects.filter(subject => subject.books?.includes(selectedBook));
    }
    return AppData.subjects;
  },
  getSubjectsForBook(book) { return AppData.subjects.filter(subject => !book || subject.books?.includes(book)); },
  getCompetitionSubjects(book) { return this.getSubjectsForBook(book).filter(subject => subject.competition !== false); },
  getSubjectLabel(v) { if (!v) return '—'; const s = AppData.subjects.find(x => x.value === v); return s ? `${s.icon} ${s.label}` : '—'; },
  getDeaconRanks(g) { const b = ['أبصالطس', 'أغنسطس', 'لم يتم الرسامة']; if (g === 'أنثى') return [...b, 'غير مطلوب']; return b; },
  getNoteCategories() { return [
    { value: 'general', label: '📝 ملاحظة عامة' }, { value: 'behavior', label: '🎭 سلوك' },
    { value: 'academic', label: '📚 أكاديمي' }, { value: 'family', label: '👨‍👩‍👧 أسري' },
    { value: 'health', label: '🏥 صحي' }, { value: 'spiritual', label: '🙏 روحي' },
    { value: 'urgent', label: '🚨 عاجل' }
  ]; },
  getCategoryLabel(v) { const f = this.getNoteCategories().find(c => c.value === v); return f ? f.label : '📝 عام'; },
  getServantAdminRolesList() { return [
    { value: 'class_supervisor', label: '👨‍🏫 مسؤول فصل', description: 'يسجل غياب فصله + يرى الدرجات + يسجل النوتة الروحية', color: '#1976d2' },
    { value: 'subject_teacher', label: '📚 مسؤول مادة', description: 'يرى ويعدل درجات مادته فقط', color: '#7b1fa2' },
    { value: 'main_control', label: '🎛️ كنترول أساسي', description: 'يرى كل البيانات + يعدل الغياب والدرجات', color: '#c62828' },
    { value: 'admin_control', label: '⚙️ خادم إداري كنترول', description: 'يختار الفصول المسؤولة + يضيف دارسين', color: '#e65100' },
    { value: 'service_manager', label: '👨‍💼 مسؤول الخدمة', description: 'كل الصلاحيات', color: '#2e7d32' },
    { value: 'father_priest', label: '⛪ الأب الكاهن', description: 'كل الصلاحيات', color: '#6B0F1A' },
    { value: 'assistant', label: '🤝 خادم مساعد', description: 'صلاحيات محدودة', color: '#9e9e9e' }
  ]; },
  getServantAdminRoles(s) { if (!s || !s.adminRole) return []; return Array.isArray(s.adminRole) ? s.adminRole : [s.adminRole]; },
  getServantSubjects(s) { if (!s || !s.subjectSpecialty) return []; return Array.isArray(s.subjectSpecialty) ? s.subjectSpecialty : [s.subjectSpecialty]; },
  getServantClassGroups(s) { if (!s || !s.classGroup) return []; if (Array.isArray(s.classGroup)) return s.classGroup; if (s.classGroup === 'الكل') return Helpers.getClassGroups(); return [s.classGroup]; },
  getServantAdminRoleLabel(v) { const f = this.getServantAdminRolesList().find(r => r.value === v); return f ? f.label : '—'; },
  hasAdminRole(s, role) { return this.getServantAdminRoles(s).includes(role); },
  isMainControl(s) { return this.hasAdminRole(s, 'main_control'); },
  isAdminControl(s) { return this.hasAdminRole(s, 'admin_control'); },
  isServiceManager(s) { return this.hasAdminRole(s, 'service_manager'); },
  isFatherPriest(s) { return this.hasAdminRole(s, 'father_priest'); },
  isClassSupervisor(s) { return this.hasAdminRole(s, 'class_supervisor'); },
  isSubjectTeacherRole(s) { return this.hasAdminRole(s, 'subject_teacher'); },
  isSubjectTeacher(s) { return this.getServantSubjects(s).length > 0; },
  isSuperAdmin(s) { return this.isServiceManager(s) || this.isFatherPriest(s); },
  canEditAttendance(s) { return this.isMainControl(s) || this.isAdminControl(s) || this.isClassSupervisor(s) || this.isSuperAdmin(s); },
  canEditGrades(s, sub = null) {
    if (this.isMainControl(s) || this.isAdminControl(s) || this.isSuperAdmin(s)) return true;
    if (sub && (this.isSubjectTeacherRole(s) || this.isClassSupervisor(s))) return this.getServantSubjects(s).includes(sub);
    return false;
  },
  canViewAllGrades(s) { return this.isMainControl(s) || this.isAdminControl(s) || this.isClassSupervisor(s) || this.isSuperAdmin(s); },
  canEditStudents(s) { return this.isMainControl(s) || this.isAdminControl(s) || this.isSuperAdmin(s); },
  canDeleteStudents(s) { return this.isSuperAdmin(s); },
  canViewAllData(s) { return this.isMainControl(s) || this.isAdminControl(s) || this.isSuperAdmin(s); },
  canAddVisitationNotes(s) { return this.isClassSupervisor(s) || this.isAdminControl(s) || this.isSuperAdmin(s); },
  canApproveSpiritualNotes(s) { return this.isMainControl(s) || this.isAdminControl(s) || this.isSuperAdmin(s); },
  canPrintReports(s) { return this.isClassSupervisor(s) || this.isMainControl(s) || this.isAdminControl(s) || this.isSuperAdmin(s); },
  canManageSystem(s) { return this.isSuperAdmin(s); },
  
  getWeekWithDate(w) {
    const s = AppData.settings;
    if (!s || !s.termStart) return { week: w, date: '—', dateShort: '—' };
    const start = new Date(s.termStart);
    const d = new Date(start); d.setDate(start.getDate() + (w - 1) * 7);
    return {
      week: w,
      date: d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
      dateShort: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
    };
  },
  getWeekDate(w) { return this.getWeekWithDate(w).date; },
  getWeekDateShort(w) { return this.getWeekWithDate(w).dateShort; },
  getStudentAdder(s) { if (!s) return '—'; return s.addedByName || 'غير محدد'; },
  
  escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
};

function showLoading(t = 'جارٍ التحميل...') { document.getElementById('loadingText').textContent = t; document.getElementById('loadingOverlay').classList.add('show'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }
function showToast(m, t = 'success') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${t}`; el.textContent = m;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2800);
}
function showModal(html, size = '') {
  const c = document.getElementById('modalContent');
  c.className = `modal ${size}`; c.innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
function toggleSidebar() { State.sidebarOpen = !State.sidebarOpen; document.getElementById('sidebar').classList.toggle('open', State.sidebarOpen); }

function renderClassFilterChips() {
  return `
    <div class="class-filter-chips">
      <button class="class-chip ${State.studyBookFilter === 'all' ? 'active' : ''}" onclick="State.setStudentFilter('studyBookFilter','all')">
        📚 كل الكتب <span class="count">${AppData.students.filter(s => s.status !== 'خريج').length}</span>
      </button>
      ${Helpers.getStudyBooks().map(book => {
        const count = AppData.students.filter(s => s.status !== 'خريج' && (s.studyBook || s.class) === book).length;
        return `<button class="class-chip ${State.studyBookFilter === book ? 'active' : ''}" onclick="State.setStudentFilter('studyBookFilter','${book}')">
          ${book} <span class="count">${count}</span>
        </button>`;
      }).join('')}
      <select class="filter-select" onchange="State.setStudentFilter('batchFilter', this.value)">
        <option value="all">جميع الدفعات</option>
        ${Helpers.getBatchYears().map(year => `<option value="${year}" ${State.batchFilter === String(year) ? 'selected' : ''}>دفعة ${year}</option>`).join('')}
      </select>
    </div>
  `;
}

function filterStudentsByClass(students) {
  return students.filter(s => {
    const active = s.status !== 'خريج';
    const book = s.studyBook || s.class || '';
    const batch = String(s.batchYear || s.classGroup || '');
    return active
      && (State.studyBookFilter === 'all' || book === State.studyBookFilter)
      && (State.batchFilter === 'all' || batch === State.batchFilter);
  });
}

function filterStudentsByServantClasses(students, servant) { return students; }

/* ============================================================
   RENDER
   ============================================================ */
function renderHome() {
  return `
    <section class="hero">
      <h1>مركز <span>الحبيب</span> للألحان ودراسة إعداد الخدام</h1>
      <p>نظام كنسي متكامل لإدارة إعداد الخدام أكاديمياً وروحياً لجميع المراحل العمرية</p>
      <p style="font-size:1.3rem;color:var(--gold);font-weight:700;margin-bottom:20px">أفهم... صلّي... استمتع</p>
      <button class="btn btn-primary btn-lg" onclick="State.setPage('login')"><span>☩</span> تسجيل الدخول</button>
    </section>
    <h2 class="section-title">رؤيتنا ورسالتنا</h2>
    <div class="grid-3 mb-3">
      <div class="vision-card"><span class="icon">👁️</span><h3>رؤية الفصل</h3><p>أن يساهم النظام في إعداد جيل خادم مؤهل علمياً وروحياً وخدمياً.</p></div>
      <div class="vision-card"><span class="icon">📜</span><h3>رسالة الفصل</h3><p>تقديم منهج كنسي متكامل يجمع بين الدراسة الأكاديمية والنمو الروحي والخدمة التطبيقية.</p></div>
      <div class="vision-card"><span class="icon">🎯</span><h3>أهداف الفصل</h3><p>المناهج الدراسية، التحضير الروحي، التقييم المستمر، والإعداد للخدمة والامتحانات.</p></div>
    </div>
  `;
}
function renderLogin() {
  return `
    <div class="login-box">
      <h2>☩ تسجيل الدخول</h2>
      <p class="sub">أدخل بياناتك للوصول إلى لوحة التحكم</p>
      <div class="login-tabs" id="loginTabs">
        <button data-role="student" class="active">دارس</button>
        <button data-role="servant">خادم</button>
        <button data-role="admin">مسؤول</button>
      </div>
      <div id="loginFormContainer">${renderStudentLoginForm()}</div>
      <div class="error-msg" id="loginError" style="display:none;"></div>
    </div>
  `;
}
function renderStudentLoginForm() {
  return `<form class="login-form" onsubmit="handleLogin('student'); return false;">
  <div class="form-group"><label>البريد الإلكتروني</label><input type="email" id="studentEmail" autocomplete="email" placeholder="name@example.com"></div>
  <div class="form-group"><label>كلمة المرور</label><input type="password" id="studentPassword" autocomplete="current-password" placeholder="أدخل كلمة المرور"></div>
  <button type="submit" class="btn btn-primary btn-block">دخول</button>
  </form>`;
}
function renderServantLoginForm() {
  return `<form class="login-form" onsubmit="handleLogin('servant'); return false;">
  <div class="form-group"><label>البريد الإلكتروني</label><input type="email" id="servantEmail" autocomplete="email" placeholder="name@example.com"></div>
  <div class="form-group"><label>كلمة المرور</label><input type="password" id="servantPassword" autocomplete="current-password" placeholder="أدخل كلمة المرور"></div>
  <button type="submit" class="btn btn-primary btn-block">دخول</button>
  </form>`;
}
function renderAdminLoginForm() {
  return `<form class="login-form" onsubmit="handleLogin('admin'); return false;">
  <div class="form-group"><label>البريد الإلكتروني</label><input type="email" id="adminUsername" autocomplete="username" placeholder="name@example.com"></div>
  <div class="form-group"><label>كلمة المرور</label><input type="password" id="adminPassword" autocomplete="current-password" placeholder="كلمة المرور"></div>
  <button type="submit" class="btn btn-primary btn-block">دخول</button>
  </form>`;
}

/* ============ Student Dashboard ============ */
function renderStudentDashboard() {
  const u = State.currentUser;
  if (!u || u.type !== 'student') return '';
  const s = u.data;
  const t = State.getTab() || 'profile';
  return `
    <div class="dashboard-header">
      <h2>👨‍🎓 مرحباً، ${s.name}</h2>
      <div class="info"><span>🆔 ${s.id}</span><span>📚 ${s.stage}</span><span>🏫 ${s.classGroup}</span></div>
    </div>
    <div class="tabs" id="studentTabs">
      <button data-tab="profile" class="${t === 'profile' ? 'active' : ''}">👤 الملف</button>
      <button data-tab="grades" class="${t === 'grades' ? 'active' : ''}">📊 الدرجات</button>
      <button data-tab="attendance" class="${t === 'attendance' ? 'active' : ''}">📋 الحضور</button>
      <button data-tab="spiritualNote" class="${t === 'spiritualNote' ? 'active' : ''}">📔 النوتة الروحية</button>
    </div>
    <div class="tab-content">${renderStudentTab(t, s)}</div>
  `;
}
function renderStudentTab(t, s) {
  switch (t) {
    case 'profile': return renderStudentProfile(s);
    case 'grades': return renderStudentGradesFull(s);
    case 'attendance': return renderStudentAttendance(s);
    case 'spiritualNote': return renderStudentSpiritualNote(s);
    default: return renderStudentProfile(s);
  }

  function renderStudentSpiritualNote(s) {
    const month = State.activeTab['student_note_month'] || new Date().toISOString().slice(0, 7);
    const notes = AppData.visitationNotes.filter(n =>
      n.type === 'spiritualDaily' &&
      String(n.studentId) === String(s.id) &&
      String(n.noteDate || '').startsWith(month)
    ).sort((a, b) => String(b.noteDate).localeCompare(String(a.noteDate)));
    const labels = { gospel: 'الإنجيل', morningPrayer: 'باكر', eveningPrayer: 'الغروب', nightPrayer: 'النوم', communion: 'التناول', confession: 'الاعتراف' };
    return `
      <div class="card">
        <div class="flex-between mb-2"><div class="card-title">📔 النوتة الروحية</div><button class="btn btn-gold btn-sm" onclick="openStudentSpiritualNoteModal('${s.id}')">+ تسجيل اليوم</button></div>
        <div class="gold-line"></div>
        <div class="form-group" style="max-width:220px"><label>الشهر</label><input type="month" value="${month}" onchange="State.activeTab['student_note_month']=this.value;renderApp()"></div>
        <div class="table-wrap">
          <table><thead><tr><th>التاريخ</th>${Object.values(labels).map(v => `<th>${v}</th>`).join('')}<th>الحالة</th></tr></thead>
          <tbody>${notes.length ? notes.map(n => `<tr><td>${Helpers.escapeHtml(n.noteDate)}</td>${Object.keys(labels).map(k => `<td>${n.items?.[k] ? '✅' : '—'}</td>`).join('')}<td><span class="badge ${n.reviewStatus === 'approved' ? 'badge-success' : 'badge-info'}">${n.reviewStatus === 'approved' ? 'معتمدة' : 'بانتظار الاعتماد'}</span></td></tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">لا توجد نوتة مسجلة لهذا الشهر</div></td></tr>`}</tbody></table>
        </div>
      </div>
    `;
  }
}
function renderStudentProfile(s) {
  return `
    <div class="grid-2">
      <div class="card"><div class="card-title">👤 البيانات الشخصية</div><div class="gold-line"></div>
        <table style="min-width:auto;box-shadow:none;">
          <tr><td><strong>الاسم:</strong></td><td>${s.name}</td></tr>
          <tr><td><strong>الكود:</strong></td><td><code class="code-badge">${s.id}</code></td></tr>
          <tr><td><strong>النوع:</strong></td><td>${s.gender || '—'}</td></tr>
          <tr><td><strong>الميلاد:</strong></td><td>${Helpers.formatDate(s.birthdate)}</td></tr>
        </table>
      </div>
      <div class="card"><div class="card-title">📚 البيانات الدراسية</div><div class="gold-line"></div>
        <table style="min-width:auto;box-shadow:none;">
          <tr><td><strong>الكتاب:</strong></td><td>${s.stage}</td></tr>
          <tr><td><strong>الدفعة:</strong></td><td>${s.classGroup}</td></tr>
          <tr><td><strong>الرتبة:</strong></td><td>${s.deaconRank || '—'}</td></tr>
        </table>
      </div>
    </div>
  `;
}
function renderStudentGradesFull(s) {
  const subjects = Helpers.getSubjects();
  const tw = AppData.settings.totalWeeks || 15;
  const te = AppData.settings.totalEvaluations || 10;
  return `
    <div class="card">
      <div class="card-title">📊 درجاتي التفصيلية</div>
      <div class="gold-line"></div>
      <div class="info-msg">المواد العادية (20+30+50) | الألحان (20+20+60)</div>
      ${subjects.map(sub => {
        const grade = GRADING_SYSTEM.calculateSubjectGrade(s.id, sub.value, tw, te);
        const letter = GRADING_SYSTEM.getGradeLetter(grade.total);
        return `
          <div class="card" style="border-right-color:${letter.color};">
            <div class="flex-between mb-2">
              <h3>${sub.icon} ${sub.label}</h3>
              <div>
                <span class="badge" style="background:${letter.color};color:white;font-size:1rem;padding:6px 14px;">${grade.total} / 100</span>
                <span class="badge" style="background:${letter.color};color:white;">${letter.label}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-info">📋 الحضور: ${grade.attendanceScore} / ${grade.weights.attendance}</span>
              <span class="badge badge-warning">📝 أعمال السنة: ${grade.evalScore} / ${grade.weights.evaluations}</span>
              <span class="badge badge-success">🎓 الامتحان: ${grade.examScore} / ${grade.weights.exam}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
function renderStudentAttendance(s) {
  const tw = AppData.settings.totalWeeks || 15;
  const att = AppData.attendance.filter(a => a.studentId === s.id && a.type !== 'visitation');
  const present = att.filter(a => a.status === 'present').length;
  const pct = Helpers.percentage(present, tw);
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="icon">📅</div><div class="num">${tw}</div><div class="lbl">الأسابيع</div></div>
      <div class="stat-card"><div class="icon">✅</div><div class="num">${present}</div><div class="lbl">حضور</div></div>
      <div class="stat-card"><div class="icon">📊</div><div class="num">${pct}%</div><div class="lbl">النسبة</div></div>
    </div>
    <div class="card">
      <div class="card-title">📅 سجل الحضور</div>
      <div class="gold-line"></div>
      <div class="table-wrap">
        <table><thead><tr><th>الأسبوع</th><th>التاريخ</th><th>الحالة</th></tr></thead>
        <tbody>
          ${Array.from({length: tw}, (_, i) => {
            const w = Helpers.getWeekWithDate(i + 1);
            const r = att.find(a => a.week === i + 1);
            const icon = !r ? '⏳' : (r.status === 'present' ? '✅' : '❌');
            return `<tr><td>الأسبوع ${w.week}</td><td>${w.date}</td><td>${icon}</td></tr>`;
          }).join('')}
        </tbody></table>
      </div>
    </div>
  `;
}

/* ============ Servant Dashboard ============ */
function renderServantDashboard() {
  const u = State.currentUser;
  if (!u || u.type !== 'servant') return '';
  const s = u.data;
  const subjects = Helpers.getServantSubjects(s);
  const roles = Helpers.getServantAdminRoles(s);
  const classes = Helpers.getServantClassGroups(s);
  const students = AppData.students;
  const isSubjectTeacher = Helpers.isSubjectTeacher(s);
  
  const tabs = [];
  if (Helpers.canEditStudents(s)) tabs.push({ key: 'manage_students', label: 'إدارة الدارسين', icon: '👨‍🎓' });
  if (Helpers.canEditAttendance(s)) tabs.push({ key: 'attendance', label: 'الحضور', icon: '📋' });
  if (Helpers.canViewAllGrades(s) || isSubjectTeacher) tabs.push({ key: 'quick_eval', label: 'أعمال السنة', icon: '⚡' });
  if (Helpers.canViewAllGrades(s) || isSubjectTeacher) tabs.push({ key: 'exams', label: 'الامتحانات', icon: '🎓' });
  if (Helpers.canViewAllGrades(s)) tabs.push({ key: 'grades_overview', label: 'نظرة عامة', icon: '📊' });
  tabs.push({ key: 'students', label: 'الدارسين', icon: '👥' });
  if (Helpers.canAddVisitationNotes(s)) tabs.push({ key: 'visitation', label: 'النوتة الروحية', icon: '🙏' });
  if (Helpers.canPrintReports(s)) tabs.push({ key: 'reports', label: 'التقارير', icon: '🖨️' });
  tabs.push({ key: 'account', label: 'حسابي', icon: '🔑' });

  const activeTab = State.getTab() || tabs[0]?.key || 'account';

  return `
    <div class="dashboard-header">
      <h2>👨‍🏫 مرحباً، ${s.name}</h2>
      <div class="info">
        <span>🏫 ${classes.join(' • ')}</span>
        <span>👥 ${students.length} دارس</span>
        ${subjects.length > 0 ? `<span>📚 ${subjects.length} مادة</span>` : ''}
      </div>
    </div>
    ${roles.length > 0 ? `
      <div class="info-msg" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <strong>🎯 أدوارك:</strong>
        ${roles.map(r => {
          const role = Helpers.getServantAdminRolesList().find(x => x.value === r);
          return role ? `<span class="badge" style="background:${role.color};color:white;">${role.label}</span>` : '';
        }).join('')}
      </div>` : ''}
    <div class="stats-grid">
      <div class="stat-card"><div class="icon">👥</div><div class="num">${students.length}</div><div class="lbl">الدارسين</div></div>
      <div class="stat-card"><div class="icon">📅</div><div class="num">${AppData.settings.currentWeek || 1}/${AppData.settings.totalWeeks || 15}</div><div class="lbl">الأسبوع</div></div>
      <div class="stat-card"><div class="icon">📊</div><div class="num">${AppData.evaluations.length}</div><div class="lbl">تقييمات</div></div>
      <div class="stat-card"><div class="icon">🎓</div><div class="num">${AppData.exams.length}</div><div class="lbl">امتحانات</div></div>
    </div>
    <div class="tabs" id="servantTabs">
      ${tabs.map(t => `<button data-tab="${t.key}" class="${activeTab === t.key ? 'active' : ''}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div class="tab-content">${renderServantTab(activeTab, s, students)}</div>
  `;
}

function renderServantTab(tab, s, students) {
  switch (tab) {
    case 'manage_students': return renderManageStudents(s, students);
    case 'attendance': return renderAttendanceTab(s, students);
    case 'quick_eval': return renderQuickEvalTab(s, students);
    case 'exams': return renderExamsTab(s, students);
    case 'grades_overview': return renderGradesOverview(s, students);
    case 'students': return renderStudentsList(s, students);
    case 'visitation': return renderVisitation(s, students);
    case 'reports': return renderReportsTab(s, students);
    case 'account': return renderAccount(s);
    default: return renderAccount(s);
  }
}

function renderManageStudents(servant, students) {
  const canDel = Helpers.canDeleteStudents(servant);
  let filtered = filterStudentsByClass(students);
  const search = State.activeTab['servant_students_search'] || '';
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.phone1 || '').includes(q));
  }
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">👨‍🎓 إدارة الدارسين (${filtered.length})</div>
        <div class="flex gap-1">
          <button class="btn btn-gold btn-sm" onclick="openAddStudentModal()">+ إضافة دارس</button>
          <button class="btn btn-outline btn-sm" onclick="exportStudentsExcel()">📊 Excel</button>
          <button class="btn btn-outline btn-sm" onclick="printClassList('${State.classFilter}')">🖨️ طباعة</button>
        </div>
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="search-box filter-item">
          <label>بحث</label>
          <input type="text" value="${search}" placeholder="الاسم / الكود / الهاتف..." oninput="State.activeTab['servant_students_search']=this.value;clearTimeout(window._st);window._st=setTimeout(()=>renderApp(),400)">
        </div>
        <button class="btn btn-outline btn-sm" onclick="State.activeTab['servant_students_search']='';renderApp()">✖ مسح</button>
      </div>
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد دارسين</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>النوع</th><th>الكتاب</th><th>الدفعة</th><th>الهاتف</th><th>أضيف بواسطة</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => `
                <tr>
                  <td>${i + 1}</td><td>${s.name}</td>
                  <td><code class="code-badge">${s.id}</code></td>
                  <td>${s.gender === 'ذكر' ? '👦' : '👧'}</td>
                  <td>${s.studyBook || s.class || '—'}</td><td>دفعة ${s.batchYear || s.classGroup || '—'}</td>
                  <td>${Helpers.studentStatusBadge(s.status)}</td>
                  <td>${s.phone1 || '—'}</td>
                  <td><span class="badge badge-adder">${Helpers.getStudentAdder(s)}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="icon-btn gold" onclick="openEditStudentModal('${s.id}')" title="تعديل">✏️</button>
                      <button class="icon-btn" onclick="printStudentCard('${s.id}')" title="طباعة">🖨️</button>
                      ${canDel ? `<button class="icon-btn danger" onclick="deleteStudentConfirm('${s.id}')" title="حذف">🗑️</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderAttendanceTab(servant, students) {
  const cw = AppData.settings.currentWeek || 1;
  const canEdit = Helpers.canEditAttendance(servant);
  const filtered = filterStudentsByClass(students);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">📋 الحضور - الأسبوع ${cw} (${Helpers.getWeekDate(cw)})</div>
        ${canEdit ? `
          <div class="flex gap-1" style="flex-wrap:wrap;">
            <button class="btn btn-info btn-sm" onclick="markAllPresent()">✅ تحديد الكل حاضر</button>
            <button class="btn btn-outline btn-sm" onclick="markAllAbsent()">❌ تحديد الكل غائب</button>
            <button class="btn btn-success btn-sm" onclick="saveAttendanceBulk(${cw})">💾 حفظ الحضور</button>
          </div>
        ` : ''}
      </div>
      <div class="gold-line"></div>
      <div class="form-group" style="max-width:400px;">
        <label>الأسبوع</label>
        <select onchange="changeWeek(this.value)">
          ${Array.from({length: AppData.settings.totalWeeks || 15}, (_, i) => {
            const w = Helpers.getWeekWithDate(i + 1);
            return `<option value="${i + 1}" ${i + 1 === cw ? 'selected' : ''}>الأسبوع ${w.week} - ${w.date}</option>`;
          }).join('')}
        </select>
      </div>
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="info-msg">💡 <strong>${filtered.length} طالب</strong> - اضغط "تحديد الكل حاضر" ثم أزل الغائبين فقط</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>المحاضرة الأولى</th><th>المحاضرة الثانية</th><th>سبب التغيير</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => {
                const r1 = AppData.attendance.find(a => a.studentId === s.id && a.week === cw && Number(a.lecture) === 1 && a.type !== 'visitation');
                const r2 = AppData.attendance.find(a => a.studentId === s.id && a.week === cw && Number(a.lecture) === 2 && a.type !== 'visitation');
                const options1 = ATTENDANCE_STATUSES.map(status => `<option value="${status}" ${(r1?.status || 'present') === status ? 'selected' : ''}>${AttendanceEngine.statusLabel(status)}</option>`).join('');
                const options2 = ATTENDANCE_STATUSES.map(status => `<option value="${status}" ${(r2?.status || 'present') === status ? 'selected' : ''}>${AttendanceEngine.statusLabel(status)}</option>`).join('');
                return `<tr>
                  <td>${i + 1}</td>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.classGroup}</td>
                  <td><select name="att_${s.id}_lecture_1" ${!canEdit ? 'disabled' : ''}>${options1}</select></td>
                  <td><select name="att_${s.id}_lecture_2" ${!canEdit ? 'disabled' : ''}>${options2}</select></td>
                  <td><input type="text" name="att_reason_${s.id}" placeholder="السبب" ${!canEdit ? 'disabled' : ''}></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderQuickEvalTab(servant, students) {
  const tw = AppData.settings.totalWeeks || 15;
  const cw = State.activeTab['quick_eval_week'] || AppData.settings.currentWeek || 1;
  const sub = State.activeTab['quick_eval_subject'] || 'rituals';
  const subject = Helpers.getSubjects().find(s => s.value === sub);
  const canEdit = Helpers.canEditGrades(servant, sub);
  const filtered = filterStudentsByClass(students);
  const weekEvals = AppData.evaluations.filter(e => e.week === cw && e.subject === sub);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">⚡ أعمال السنة - ${subject?.label || ''}</div>
        ${canEdit ? `<button class="btn btn-success btn-sm" onclick="saveQuickEvaluations('${sub}', ${cw})">💾 حفظ</button>` : ''}
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="filter-item">
          <label>المادة</label>
          <select onchange="State.activeTab['quick_eval_subject']=this.value;renderApp()">
            ${Helpers.getSubjects().map(s => `<option value="${s.value}" ${s.value === sub ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>الأسبوع</label>
          <select onchange="State.activeTab['quick_eval_week']=parseInt(this.value);renderApp()">
            ${Array.from({length: tw}, (_, i) => {
              const w = Helpers.getWeekWithDate(i + 1);
              return `<option value="${i + 1}" ${i + 1 === cw ? 'selected' : ''}>الأسبوع ${w.week} - ${w.date}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
      ${!canEdit ? '<div class="info-msg">👁️ عرض فقط</div>' : ''}
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>الدرجة (1-10)</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => {
                const e = weekEvals.find(x => x.studentId === s.id);
                const score = e ? e.score : '';
                return `<tr>
                  <td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>
                  <td><input type="number" min="1" max="10" class="quick-eval-input ${score ? 'filled' : ''}" data-student="${s.id}" value="${score}" ${!canEdit ? 'disabled' : ''} onchange="this.classList.toggle('filled', !!this.value)"></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderExamsTab(servant, students) {
  const sub = State.activeTab['exams_subject'] || 'rituals';
  const subject = Helpers.getSubjects().find(s => s.value === sub);
  const canEdit = Helpers.canEditGrades(servant, sub);
  const filtered = filterStudentsByClass(students);
  const weights = GRADING_SYSTEM.getWeights(sub);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">🎓 درجات الامتحانات</div>
        ${canEdit ? `<button class="btn btn-success btn-sm" onclick="saveExamsBulk('${sub}')">💾 حفظ</button>` : ''}
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="filter-item">
          <label>المادة</label>
          <select onchange="State.activeTab['exams_subject']=this.value;renderApp()">
            ${Helpers.getSubjects().map(s => `<option value="${s.value}" ${s.value === sub ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      ${!canEdit ? '<div class="info-msg">👁️ عرض فقط</div>' : ''}
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>درجة الامتحان (من ${weights.exam})</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => {
                const exam = AppData.exams.find(e => e.studentId === s.id && e.subject === sub);
                const score = exam ? exam.score : '';
                return `<tr>
                  <td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>
                  <td><input type="number" min="0" max="${weights.exam}" class="exam-input" data-student="${s.id}" value="${score}" ${!canEdit ? 'disabled' : ''}></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderGradesOverview(servant, students) {
  const subjects = Helpers.getSubjects();
  const tw = AppData.settings.totalWeeks || 15;
  const te = AppData.settings.totalEvaluations || 10;
  const filtered = filterStudentsByClass(students);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="card-title">📊 نظرة عامة على الدرجات</div>
      <div class="gold-line"></div>
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>الدارس</th><th>الدفعة</th>${subjects.map(s => `<th>${s.icon} ${s.label}</th>`).join('')}<th>المجموع</th><th>التقدير</th></tr></thead>
            <tbody>
              ${filtered.map(s => {
                const grades = subjects.map(sub => GRADING_SYSTEM.calculateSubjectGrade(s.id, sub.value, tw, te));
                const countedGrades = grades.filter((grade, index) => subjects[index]?.countInTotal !== false);
                const total = countedGrades.reduce((sum, g) => sum + g.total, 0);
                const avg = countedGrades.length > 0 ? total / countedGrades.length : 0;
                const letter = GRADING_SYSTEM.getGradeLetter(avg);
                return `<tr>
                  <td>${s.name}</td><td>${s.classGroup}</td>
                  ${grades.map(g => `<td><strong style="color:${GRADING_SYSTEM.getGradeLetter(g.total).color};">${g.total}</strong></td>`).join('')}
                  <td><strong>${total.toFixed(1)}</strong></td>
                  <td><span class="badge" style="background:${letter.color};color:white;">${letter.label}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderStudentsList(servant, students) {
  const filtered = filterStudentsByClass(students);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="card-title">👥 الدارسين (<span id="activeStudentsCount">${filtered.length}</span>)</div>
      <div class="gold-line"></div>
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الكتاب</th><th>الدفعة</th><th>الهاتف</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => `
                <tr><td>${i + 1}</td><td>${s.name}</td><td><code class="code-badge">${s.id}</code></td>
                <td>${s.stage}</td><td>${s.classGroup}</td><td>${s.phone1 || '—'}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderVisitation(servant, students) {
  const cw = AppData.settings.currentWeek || 1;
  const filtered = filterStudentsByClass(students);
  const canAdd = Helpers.canAddVisitationNotes(servant);
  const notes = AppData.visitationNotes.filter(n => n.week === cw);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="card-title">🙏 النوتة الروحية - الأسبوع ${cw} (${Helpers.getWeekDate(cw)})</div>
      <div class="gold-line"></div>
      ${filtered.length === 0 ? '<div class="empty-state">لا يوجد طلاب</div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>ملاحظات</th></tr></thead>
            <tbody>
              ${filtered.map((s, i) => {
                const studentNotes = notes.filter(n => n.studentId === s.id);
                const safeName = s.name.replace(/'/g, "\\'");
                return `<tr>
                  <td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>
                  <td><button class="btn btn-sm ${studentNotes.length > 0 ? 'btn-info' : 'btn-outline'}"
                    onclick="openNotesModal('${s.id}', '${safeName}', ${cw})">
                    📔 ${studentNotes.length > 0 ? `عرض (${studentNotes.length})` : (canAdd ? 'إضافة' : 'عرض')}
                  </button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderReportsTab(servant, students) {
  const classGroups = Helpers.getClassGroups();
  const selectedClass = State.activeTab['report_class'] || 'all';
  const filteredStudents = selectedClass === 'all' ? students : students.filter(s => s.classGroup === selectedClass);
  
  return `
    <div class="report-section">
      <div class="report-header-row">
        <div class="report-buttons-grid">
          <button class="report-btn all-btn" onclick="selectReportClass('all')">📋 كل الفصول (${students.length})</button>
          ${classGroups.map(g => {
            const count = students.filter(s => s.classGroup === g).length;
            return `<button class="report-btn" onclick="selectReportClass('${g.replace(/'/g, "\\'")}')" style="${selectedClass === g ? 'background:linear-gradient(135deg,var(--wine),#8a1422);' : ''}">${g} (${count})</button>`;
          }).join('')}
        </div>
        <div class="report-section-title">
          <span>اختيار الدفعة للطباعة</span>
          <span class="icon">📋</span>
        </div>
      </div>
      <div class="selected-class-info"><strong>✅ الدفعة المختار:</strong> ${selectedClass === 'all' ? 'كل الفصول' : selectedClass} — ${filteredStudents.length} دارس</div>
    </div>
    
    <div class="report-section">
      <div class="report-header-row">
        <div class="report-buttons-grid">
          <button class="report-btn excel-btn" onclick="exportStudentsExcel()">📊 Excel</button>
          <button class="report-btn" onclick="printClassList('${selectedClass}')">🖨️ طباعة القائمة</button>
        </div>
        <div class="report-section-title">
          <span>قوائم الفصول</span>
          <span class="icon">📋</span>
        </div>
      </div>
    </div>
    
    <div class="report-section">
      <div class="report-header-row">
        <div class="report-buttons-grid">
          <button class="report-btn all-btn" onclick="printAttendanceReport('all')">📋 شامل</button>
          ${classGroups.map(g => `<button class="report-btn" onclick="printAttendanceReport('${g.replace(/'/g, "\\'")}')">${g}</button>`).join('')}
        </div>
        <div class="report-section-title">
          <span>كشوف الحضور</span>
          <span class="icon">📊</span>
        </div>
      </div>
    </div>
    
    <div class="report-section">
      <div class="report-header-row">
        <div class="report-buttons-grid">
          <button class="report-btn all-btn" onclick="printClassGradesReport('all', 'all')">📋 كل الفصول</button>
          ${classGroups.map(g => `<button class="report-btn" onclick="printClassGradesReport('${g.replace(/'/g, "\\'")}', 'all')">${g}</button>`).join('')}
        </div>
        <div class="report-section-title">
          <span>كشوف أعمال السنة</span>
          <span class="icon">📝</span>
        </div>
      </div>
    </div>
    
    <div class="report-section">
      <div class="report-header-row">
        <div class="report-buttons-grid">
          <button class="report-btn all-btn" onclick="printMonthlySpiritualNoteReport()">📋 الكشف الشهري الكامل</button>
          ${Helpers.getBatchYears().map(year => `<button class="report-btn" onclick="printMonthlySpiritualNoteReport('${year}')">دفعة ${year}</button>`).join('')}
        </div>
        <div class="report-section-title">
          <span>تقارير النوتة الروحية</span>
          <span class="icon">📔</span>
        </div>
      </div>
    </div>
  `;
}

function selectReportClass(cls) {
  State.activeTab['report_class'] = cls;
  renderApp();
  showToast(`✅ تم اختيار: ${cls === 'all' ? 'كل الفصول' : cls}`, 'info');
}

function renderAccount(servant) {
  const subjects = Helpers.getServantSubjects(servant);
  const roles = Helpers.getServantAdminRoles(servant);
  const classes = Helpers.getServantClassGroups(servant);
  return `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">👤 بياناتي</div>
        <div class="gold-line"></div>
        <table style="min-width:auto;box-shadow:none;">
          <tr><td><strong>الاسم:</strong></td><td>${servant.name}</td></tr>
          <tr><td><strong>الكود:</strong></td><td><code class="code-badge">${servant.code}</code></td></tr>
          <tr><td><strong>الهاتف:</strong></td><td>${servant.phone || '—'}</td></tr>
          <tr><td><strong>الفصول:</strong></td><td>${classes.join(' • ')}</td></tr>
          <tr><td><strong>المواد:</strong></td><td>${subjects.map(x => Helpers.getSubjectLabel(x)).join('، ') || '—'}</td></tr>
          <tr><td><strong>الأدوار:</strong></td><td>${roles.map(r => Helpers.getServantAdminRoleLabel(r)).join('، ') || '—'}</td></tr>
        </table>
      </div>
      <div class="card">
        <div class="card-title">🔑 تغيير كلمة المرور</div>
        <div class="gold-line"></div>
        <div class="form-group"><label>كلمة المرور الحالية</label><input type="password" id="currentPassword"></div>
        <div class="form-group"><label>كلمة المرور الجديدة</label><input type="password" id="newPassword"></div>
        <div class="form-group"><label>تأكيد كلمة المرور</label><input type="password" id="confirmPassword"></div>
        <button class="btn btn-primary" onclick="changeServantPassword('${servant.id}')">🔑 تغيير</button>
      </div>
    </div>
  `;
}

/* ============ Admin Dashboard ============ */
function renderAdminDashboard() {
  const u = State.currentUser;
  if (!u || u.type !== 'admin') return '';
  const students = AppData.students;
  const servants = AppData.servants;
  const activeTab = State.getTab() || 'students';
  const activeSessions = AppData.activeSessions.filter(s => SessionTracker.isSessionActive(s)).length;
  const idleSessions = AppData.activeSessions.filter(s => SessionTracker.isSessionIdle(s)).length;

  return `
    <div class="dashboard-header">
      <h2>👨‍💼 لوحة تحكم المسؤول العام</h2>
      <div class="info">
        <span>👥 ${students.length} دارس</span>
        <span>👨‍🏫 ${servants.length} خادم</span>
        <span>🟢 ${activeSessions} متصل الآن</span>
        <span>🟡 ${idleSessions} خامل</span>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="icon">👥</div><div class="num">${students.length}</div><div class="lbl">الدارسين</div></div>
      <div class="stat-card"><div class="icon">👨‍🏫</div><div class="num">${servants.length}</div><div class="lbl">الخدام</div></div>
      <div class="stat-card"><div class="icon">🟢</div><div class="num">${activeSessions}</div><div class="lbl">متصل الآن</div></div>
      <div class="stat-card"><div class="icon">📊</div><div class="num">${AppData.evaluations.length}</div><div class="lbl">أعمال السنة</div></div>
    </div>
    <div class="tabs" id="adminTabs">
      <button data-tab="students" class="${activeTab === 'students' ? 'active' : ''}">👨‍🎓 الدارسين</button>
      <button data-tab="graduates" class="${activeTab === 'graduates' ? 'active' : ''}">🎓 خريجي إعداد الخدام</button>
      <button data-tab="servants" class="${activeTab === 'servants' ? 'active' : ''}">👨‍🏫 الخدام</button>
      <button data-tab="attendance" class="${activeTab === 'attendance' ? 'active' : ''}">📋 الحضور</button>
      <button data-tab="evaluation" class="${activeTab === 'evaluation' ? 'active' : ''}">⚡ التقييم</button>
      <button data-tab="exams" class="${activeTab === 'exams' ? 'active' : ''}">🎓 الامتحانات</button>
      <button data-tab="notes" class="${activeTab === 'notes' ? 'active' : ''}">📔 النوتة الروحية</button>
      <button data-tab="sessions" class="${activeTab === 'sessions' ? 'active' : ''}">👁️ المتصلون (${activeSessions + idleSessions})</button>
      <button data-tab="reports" class="${activeTab === 'reports' ? 'active' : ''}">🖨️ التقارير</button>
      <button data-tab="system" class="${activeTab === 'system' ? 'active' : ''}">⚙️ إدارة النظام</button>
    </div>
    <div class="tab-content">${renderAdminTab(activeTab, students, servants)}</div>
  `;
}

function renderAdminTab(tab, students, servants) {
  switch (tab) {
    case 'students': return renderAdminStudents(students);
    case 'graduates': return renderGraduates(students);
    case 'servants': return renderAdminServants(servants);
    case 'attendance': return renderAdminAttendance(students);
    case 'evaluation': return renderAdminQuickEval(students);
    case 'exams': return renderAdminExams(students);
    case 'notes': return renderAdminNotes();
    case 'sessions': return renderActiveSessionsTab();
    case 'reports': return renderAdminReports();
    case 'system': return renderSystemManagement();
    default: return renderAdminStudents(students);
  }
}

function renderActiveSessionsTab() {
  const allSessions = AppData.activeSessions;
  const activeSessions = allSessions.filter(s => SessionTracker.isSessionActive(s));
  const idleSessions = allSessions.filter(s => SessionTracker.isSessionIdle(s));
  const inactiveSessions = allSessions.filter(s => !s.isActive || (!SessionTracker.isSessionActive(s) && !SessionTracker.isSessionIdle(s)));
  
  const sortByLastSeen = (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen);
  activeSessions.sort(sortByLastSeen);
  idleSessions.sort(sortByLastSeen);
  
  const renderSessionCard = (s, status) => {
    const statusLabel = status === 'active' ? '🟢 متصل الآن' : status === 'idle' ? '🟡 خامل' : '⚫ غير نشط';
    const statusClass = status === 'active' ? 'online-now' : status === 'idle' ? 'idle' : '';
    const userIcon = s.userType === 'servant' ? '👨‍🏫' : s.userType === 'admin' ? '👨‍💼' : '👨‍🎓';
    const typeLabel = s.userType === 'servant' ? 'خادم' : s.userType === 'admin' ? 'مسؤول' : 'دارس';
    const isThisDevice = SessionTracker.isThisDevice(s);
    
    return `
      <div class="active-user-card ${statusClass} ${isThisDevice ? 'this-device' : ''}">
        <div class="user-header">
          <span class="user-name">${userIcon} ${s.userName}${isThisDevice ? ' <span class="badge badge-me">📱 هذا جهازك</span>' : ''}</span>
          <span class="badge ${status === 'active' ? 'badge-success' : status === 'idle' ? 'badge-warning' : 'badge-info'}" style="${status === 'active' ? 'background:#2e7d32;color:white;' : ''}">
            ${status === 'active' ? '<span class="online-dot"></span>' : ''}${statusLabel}
          </span>
        </div>
        <div class="user-info">
          <strong>النوع:</strong> ${typeLabel} • 
          <strong>الكود:</strong> ${s.userCode || '—'}<br>
          <strong>الجهاز:</strong> ${s.deviceType || '—'}<br>
          <strong>تسجيل الدخول:</strong> ${Helpers.formatDateTime(s.loginAt)}<br>
          <strong>آخر نشاط:</strong> ${Helpers.formatTimeAgo(s.lastSeen)}
        </div>
        <div class="user-actions">
          ${status !== 'inactive' && s.isActive ? `
            ${isThisDevice ? `
              <button class="btn btn-sm btn-primary" onclick="State.logout()">🚪 خروج من هذا الجهاز</button>
            ` : `
              <button class="btn btn-sm btn-danger" onclick="forceLogoutUser('${s.id}', '${s.userName.replace(/'/g, "\\'")}')">
                🚫 إخراج من النظام
              </button>
            `}
          ` : `<span class="badge badge-info">انتهت الجلسة</span>`}
        </div>
      </div>
    `;
  };
  
  return `
    <div class="active-users-section">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="color:var(--navy);margin-bottom:6px;">👁️ مراقبة المستخدمين المتصلين</h3>
          <p class="text-muted">متابعة مباشرة لجميع المستخدمين داخل النظام</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="cleanupSessions()">🧹 تنظيف الجلسات القديمة</button>
      </div>
      
      <div class="stats-grid" style="margin-top:16px;">
        <div class="stat-card" style="border-top-color:var(--success);">
          <div class="icon">🟢</div>
          <div class="num" style="color:var(--success);">${activeSessions.length}</div>
          <div class="lbl">متصل الآن</div>
        </div>
        <div class="stat-card" style="border-top-color:var(--warning);">
          <div class="icon">🟡</div>
          <div class="num" style="color:var(--warning);">${idleSessions.length}</div>
          <div class="lbl">خامل</div>
        </div>
        <div class="stat-card" style="border-top-color:var(--info);">
          <div class="icon">📊</div>
          <div class="num" style="color:var(--info);">${allSessions.length}</div>
          <div class="lbl">إجمالي الجلسات</div>
        </div>
      </div>
    </div>
    
    ${activeSessions.length > 0 ? `
      <div class="card" style="border-right-color:var(--success);">
        <div class="card-title"><span class="online-dot"></span> المتصلون الآن (${activeSessions.length})</div>
        <div class="gold-line"></div>
        <div class="active-users-grid">
          ${activeSessions.map(s => renderSessionCard(s, 'active')).join('')}
        </div>
      </div>
    ` : ''}
    
    ${idleSessions.length > 0 ? `
      <div class="card" style="border-right-color:var(--warning);">
        <div class="card-title">🟡 الخاملون (${idleSessions.length})</div>
        <div class="gold-line"></div>
        <div class="active-users-grid">
          ${idleSessions.map(s => renderSessionCard(s, 'idle')).join('')}
        </div>
      </div>
    ` : ''}
    
    ${inactiveSessions.length > 0 ? `
      <div class="card">
        <div class="card-title">⚫ الجلسات المنتهية (${inactiveSessions.length})</div>
        <div class="gold-line"></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>المستخدم</th><th>النوع</th><th>الكود</th><th>دخول</th><th>خروج</th><th>الحالة</th></tr></thead>
            <tbody>
              ${inactiveSessions.slice(0, 20).map(s => `
                <tr>
                  <td>${s.userName}${SessionTracker.isThisDevice(s) ? ' <span class="badge badge-me">📱 جهازك</span>' : ''}</td>
                  <td>${s.userType === 'servant' ? '👨‍🏫 خادم' : s.userType === 'admin' ? '👨‍💼 مسؤول' : '👨‍🎓 دارس'}</td>
                  <td><code class="code-badge">${s.userCode || '—'}</code></td>
                  <td>${Helpers.formatDateTime(s.loginAt)}</td>
                  <td>${s.logoutAt ? Helpers.formatDateTime(s.logoutAt) : '—'}</td>
                  <td>${s.forcedLogout ? '<span class="badge badge-danger">🚫 مُخرج</span>' : '<span class="badge badge-info">انتهت</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
    
    ${allSessions.length === 0 ? `
      <div class="empty-state">
        <span class="icon">👁️</span>
        <h4>لا توجد جلسات نشطة</h4>
        <p>سيظهر هنا كل مستخدم يقوم بتسجيل الدخول</p>
      </div>
    ` : ''}
  `;
}

function renderAdminStudents(students) {
  let filtered = filterStudentsByClass(students);
  const search = State.activeTab['admin_students_search'] || '';
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.id || '').toLowerCase().includes(q) ||
      String(s.email || '').toLowerCase().includes(q)
    );
  }

  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">👥 الدارسين (${filtered.length})</div>
        <div class="flex gap-1">
          <button class="btn btn-gold btn-sm" onclick="openAddStudentModal()">+ إضافة</button>
          <button class="btn btn-outline btn-sm" onclick="exportStudentsExcel()">📊 Excel</button>
        </div>
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="search-box filter-item">
          <label>بحث</label>
          <input id="activeStudentsSearch" type="search" value="${search}" placeholder="الاسم / الكود / البريد..." oninput="filterStudentsTable(this.value, 'activeStudentsTable', 'activeStudentsCount')">
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('activeStudentsSearch')?.focus()">🔍 بحث تلقائي</button>
      </div>
      <div class="table-wrap">
        <table id="activeStudentsTable">
          <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>النوع</th><th>الكتاب</th><th>الدفعة</th><th>الحالة</th><th>أضيف بواسطة</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${filtered.map((s, i) => `
              <tr data-search="${Helpers.escapeHtml(`${s.name || ''} ${s.id || ''} ${s.email || ''} ${s.phone1 || ''}`.toLowerCase())}">
                <td>${i + 1}</td><td>${s.name}</td>
                <td><code class="code-badge">${s.id}</code></td>
                <td>${s.gender === 'ذكر' ? '👦' : '👧'}</td>
                <td>${s.studyBook || s.class || '—'}</td><td>دفعة ${s.batchYear || s.classGroup || '—'}</td>
                <td>${Helpers.studentStatusBadge(s.status)}</td>
                <td><span class="badge badge-adder">${Helpers.getStudentAdder(s)}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="icon-btn" onclick="openStudentFile('${s.id}')" title="عرض ملف الطالب">👤</button>
                    <button class="icon-btn gold" onclick="openEditStudentModal('${s.id}')">✏️</button>
                    <button class="icon-btn" onclick="printStudentCard('${s.id}')">🖨️</button>
                    <button class="icon-btn danger" onclick="deleteStudentConfirm('${s.id}')">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderGraduates(students) {
  const isGraduated = s => String(s.status || s.academicStatus || '').trim() === 'خريج' ||
    s.isGraduate === true ||
    String(s.graduationName || '').includes('خريج');
  const graduates = students.filter(s =>
    isGraduated(s)
  ).filter(s =>
    State.graduateBatchFilter === 'all' ||
    String(s.graduationYear || s.batchYear || s.classGroup || '') === State.graduateBatchFilter
  );
  return `
    <div class="filters-bar">
      <div class="search-box filter-item" style="min-width:260px">
        <label>بحث باسم الخريج أو الكود</label>
        <input id="graduatesSearch" type="search" placeholder="الاسم / الكود..." oninput="filterStudentsTable(this.value, 'graduatesTable', 'graduatesCount')">
      </div>
      <div class="form-group" style="min-width:220px">
        <label>دفعة الخريجين</label>
        <select onchange="State.setStudentFilter('graduateBatchFilter', this.value)">
          <option value="all">جميع الدفعات</option>
          ${Helpers.getBatchYears().map(year => `<option value="${year}" ${State.graduateBatchFilter === String(year) ? 'selected' : ''}>دفعة ${year}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🎓 خريجي إعداد الخدام (<span id="graduatesCount">${graduates.length}</span>)</div>
      <div class="gold-line"></div>
      ${graduates.length ? `<div class="table-wrap"><table id="graduatesTable">
        <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الدفعة</th><th>بيان التخرج</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${graduates.map((s, i) => `
          <tr data-search="${Helpers.escapeHtml(`${s.name || ''} ${s.id || ''} ${s.email || ''}`.toLowerCase())}"><td>${i + 1}</td><td>${s.name}</td><td><code>${s.id}</code></td>
          <td>دفعة ${s.batchYear || s.classGroup || '—'}</td>
          <td>${s.graduationName || (s.graduationYear ? `خريج نيروز - ${s.graduationYear}` : '—')}</td>
          <td>${Helpers.studentStatusBadge('خريج')}</td>
          <td><div class="table-actions">
            <button class="icon-btn" onclick="openStudentFile('${s.id}')" title="عرض ملف الطالب">👤</button>
            <button class="icon-btn gold" onclick="openEditStudentModal('${s.id}')" title="تعديل">✏️</button>
            <button class="icon-btn" onclick="printStudentCard('${s.id}')" title="طباعة">🖨️</button>
            <button class="icon-btn danger" onclick="deleteStudentConfirm('${s.id}')" title="حذف">🗑️</button>
          </div></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty-state">لا يوجد خريجون مطابقة للدفعة المختارة</div>'}
    </div>`;
}

function filterStudentsTable(query, tableId, countId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const normalized = String(query || '').trim().toLocaleLowerCase('ar');
  let visible = 0;
  table.querySelectorAll('tbody tr[data-search]').forEach(row => {
    const matches = !normalized || row.dataset.search.includes(normalized);
    row.style.display = matches ? '' : 'none';
    if (matches) visible++;
  });
  const count = document.getElementById(countId);
  if (count) count.textContent = String(visible);
}

function renderAdminServants(servants) {
  return `
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">👨‍🏫 الخدام (${servants.length})</div>
        <button class="btn btn-gold btn-sm" onclick="openAddServantModal()">+ إضافة خادم</button>
      </div>
      <div class="gold-line"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الهاتف</th><th>الفصول</th><th>الأدوار</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${servants.map((s, i) => {
              const roles = Helpers.getServantAdminRoles(s);
              const classes = Helpers.getServantClassGroups(s);
              return `<tr>
                <td>${i + 1}</td><td>${s.name}</td>
                <td><code class="code-badge">${s.code}</code></td>
                <td>${s.phone || '—'}</td>
                <td style="font-size:0.75rem;">${classes.join(' • ')}</td>
                <td style="font-size:0.75rem;">${roles.map(r => {
                  const role = Helpers.getServantAdminRolesList().find(x => x.value === r);
                  return role ? `<span class="badge" style="background:${role.color};color:white;font-size:0.68rem;">${role.label}</span>` : '';
                }).join(' ')}</td>
                <td>
                  <div class="table-actions">
                    <button class="icon-btn gold" onclick="openEditServantModal('${s.id}')">✏️</button>
                    <button class="icon-btn danger" onclick="deleteServantConfirm('${s.id}')">🗑️</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminAttendance(students) {
  const cw = AppData.settings.currentWeek || 1;
  const filtered = filterStudentsByClass(students);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">📋 الحضور - الأسبوع ${cw} (${Helpers.getWeekDate(cw)})</div>
        <div class="flex gap-1">
          <button class="btn btn-info btn-sm" onclick="markAllPresent()">✅ الكل حاضر</button>
          <button class="btn btn-outline btn-sm" onclick="markAllAbsent()">❌ الكل غائب</button>
          <button class="btn btn-success btn-sm" onclick="saveAttendanceBulk(${cw})">💾 حفظ</button>
        </div>
      </div>
      <div class="gold-line"></div>
      <div class="form-group" style="max-width:400px;">
        <label>الأسبوع</label>
        <select onchange="changeWeek(this.value)">
          ${Array.from({length: AppData.settings.totalWeeks || 15}, (_, i) => {
            const w = Helpers.getWeekWithDate(i + 1);
            return `<option value="${i + 1}" ${i + 1 === cw ? 'selected' : ''}>الأسبوع ${w.week} - ${w.date}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>المحاضرة الأولى</th><th>المحاضرة الثانية</th><th>سبب التغيير</th></tr></thead>
          <tbody>
            ${filtered.map((s, i) => {
              const r1 = AppData.attendance.find(a => a.studentId === s.id && a.week === cw && Number(a.lecture) === 1 && a.type !== 'visitation');
              const r2 = AppData.attendance.find(a => a.studentId === s.id && a.week === cw && Number(a.lecture) === 2 && a.type !== 'visitation');
              const options1 = ATTENDANCE_STATUSES.map(status => `<option value="${status}" ${(r1?.status || 'present') === status ? 'selected' : ''}>${AttendanceEngine.statusLabel(status)}</option>`).join('');
              const options2 = ATTENDANCE_STATUSES.map(status => `<option value="${status}" ${(r2?.status || 'present') === status ? 'selected' : ''}>${AttendanceEngine.statusLabel(status)}</option>`).join('');
              return `<tr>
                <td>${i + 1}</td><td><strong>${s.name}</strong></td><td>${s.classGroup}</td>
                <td><select name="att_${s.id}_lecture_1">${options1}</select></td>
                <td><select name="att_${s.id}_lecture_2">${options2}</select></td>
                <td><input type="text" name="att_reason_${s.id}" placeholder="السبب"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminQuickEval(students) {
  const tw = AppData.settings.totalWeeks || 15;
  const cw = State.activeTab['admin_eval_week'] || AppData.settings.currentWeek || 1;
  const sub = State.activeTab['admin_eval_subject'] || 'rituals';
  const filtered = filterStudentsByClass(students);
  const weekEvals = AppData.evaluations.filter(e => e.week === cw && e.subject === sub);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">⚡ أعمال السنة</div>
        <button class="btn btn-success btn-sm" onclick="saveQuickEvaluations('${sub}', ${cw})">💾 حفظ</button>
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="filter-item">
          <label>المادة</label>
          <select onchange="State.activeTab['admin_eval_subject']=this.value;renderApp()">
            ${Helpers.getSubjects().map(s => `<option value="${s.value}" ${s.value === sub ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>الأسبوع</label>
          <select onchange="State.activeTab['admin_eval_week']=parseInt(this.value);renderApp()">
            ${Array.from({length: tw}, (_, i) => {
              const w = Helpers.getWeekWithDate(i + 1);
              return `<option value="${i + 1}" ${i + 1 === cw ? 'selected' : ''}>الأسبوع ${w.week} - ${w.date}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>الدرجة (1-10)</th></tr></thead>
          <tbody>
            ${filtered.map((s, i) => {
              const e = weekEvals.find(x => x.studentId === s.id);
              const score = e ? e.score : '';
              return `<tr>
                <td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>
                <td><input type="number" min="1" max="10" class="quick-eval-input ${score ? 'filled' : ''}" data-student="${s.id}" value="${score}" onchange="this.classList.toggle('filled', !!this.value)"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminExams(students) {
  const sub = State.activeTab['admin_exam_subject'] || 'rituals';
  const filtered = filterStudentsByClass(students);
  const weights = GRADING_SYSTEM.getWeights(sub);
  return `
    ${renderClassFilterChips()}
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">🎓 درجات الامتحانات</div>
        <button class="btn btn-success btn-sm" onclick="saveExamsBulk('${sub}')">💾 حفظ</button>
      </div>
      <div class="gold-line"></div>
      <div class="filters-bar">
        <div class="filter-item">
          <label>المادة</label>
          <select onchange="State.activeTab['admin_exam_subject']=this.value;renderApp()">
            ${Helpers.getSubjects().map(s => `<option value="${s.value}" ${s.value === sub ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>الدارس</th><th>الدفعة</th><th>الدرجة (من ${weights.exam})</th></tr></thead>
          <tbody>
            ${filtered.map((s, i) => {
              const exam = AppData.exams.find(e => e.studentId === s.id && e.subject === sub);
              const score = exam ? exam.score : '';
              return `<tr>
                <td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>
                <td><input type="number" min="0" max="${weights.exam}" class="exam-input" data-student="${s.id}" value="${score}"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminNotes() {
  const view = State.activeTab['notes_view'] || 'daily';
  const month = State.activeTab['notes_month'] || new Date().toISOString().slice(0, 7);
  const search = String(State.activeTab['notes_search'] || '').trim().toLocaleLowerCase('ar');
  let students = AppData.students.filter(s => String(s.status || '') !== 'خريج');
  if (State.studyBookFilter !== 'all') students = students.filter(s => (s.studyBook || s.class) === State.studyBookFilter);
  if (State.batchFilter !== 'all') students = students.filter(s => String(s.batchYear || s.classGroup || '') === String(State.batchFilter));
  if (search) students = students.filter(s => `${s.name || ''} ${s.id || ''}`.toLocaleLowerCase('ar').includes(search));
  const itemLabels = { gospel: 'قراءة الإنجيل', morningPrayer: 'صلاة باكر', eveningPrayer: 'صلاة الغروب', nightPrayer: 'صلاة النوم', communion: 'التناول', confession: 'الاعتراف' };
  const dailyNotes = AppData.visitationNotes.filter(n => n.type === 'spiritualDaily');
  const summarizeMonth = studentId => {
    const days = dailyNotes.filter(n => String(n.studentId) === String(studentId) && String(n.noteDate || '').startsWith(month));
    const uniqueDays = [...new Set(days.map(n => n.noteDate))];
    const itemStats = Object.keys(itemLabels).map(key => {
      const done = uniqueDays.filter(date => days.find(n => n.noteDate === date)?.items?.[key] === true).length;
      return { key, label: itemLabels[key], done, percent: uniqueDays.length ? Math.round(done / uniqueDays.length * 100) : 0 };
    });
    return { days: uniqueDays.length, itemStats };
  };
  return `
    ${renderClassFilterChips()}
    <div class="filters-bar">
      <div class="search-box filter-item" style="min-width:260px"><label>بحث عن دارس</label><input type="search" value="${Helpers.escapeHtml(search)}" placeholder="الاسم أو الكود..." oninput="State.activeTab['notes_search']=this.value;filterNotesStudents(this.value)"></div>
      <div class="form-group"><label>الشهر</label><input type="month" value="${month}" onchange="State.activeTab['notes_month']=this.value;renderApp()"></div>
      <div class="form-group"><label>العرض</label><select onchange="State.activeTab['notes_view']=this.value;renderApp()"><option value="daily" ${view === 'daily' ? 'selected' : ''}>التسجيل اليومي</option><option value="monthly" ${view === 'monthly' ? 'selected' : ''}>التقرير الشهري</option></select></div>
      <button class="btn btn-outline btn-sm" onclick="openSpiritualNoteRules()">⚙️ شروط أهلية الامتحان</button>
      <button class="btn btn-outline btn-sm" onclick="printMonthlySpiritualNoteReport()">🖨️ طباعة الكشف الشهري</button>
    </div>
    <div class="card">
      <div class="card-title">📔 النوتة الروحية (${students.length})</div>
      <div class="gold-line"></div>
      ${students.length === 0 ? '<div class="empty-state">لا يوجد دارسون مطابقون للفلاتر</div>' : view === 'daily' ? `
        <div class="table-wrap"><table><thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الدفعة</th><th>الكتاب</th><th>أيام الشهر المسجلة</th><th>إجراء</tr></thead><tbody>
        ${students.map((s, i) => {
          const summary = summarizeMonth(s.id);
          const monthRecords = dailyNotes.filter(n => String(n.studentId) === String(s.id) && String(n.noteDate || '').startsWith(month));
          const pending = monthRecords.filter(n => n.reviewStatus !== 'approved').length;
          return `<tr><td>${i + 1}</td><td>${Helpers.escapeHtml(s.name)}</td><td><code>${Helpers.escapeHtml(s.id)}</code></td><td>دفعة ${Helpers.escapeHtml(s.batchYear || s.classGroup || '—')}</td><td>${Helpers.escapeHtml(s.studyBook || s.class || '—')}</td><td><span class="badge badge-info">${summary.days} يوم</span></td><td><div class="table-actions"><button class="btn btn-gold btn-sm" onclick="openSpiritualNoteModal('${s.id}')">📝 تسجيل</button>${canApproveMonthlyNotes() && pending ? `<button class="btn btn-outline btn-sm" onclick="approveMonthlySpiritualNotes('${s.id}')">✅ اعتماد (${pending})</button>` : ''}</div></td></tr>`;
        }).join('')}
        </tbody></table></div>` : `
        <div class="table-wrap"><table><thead><tr><th>الدارس</th><th>الأيام المسجلة</th>${Object.values(itemLabels).map(label => `<th>${label}</th>`).join('')}<th>الحالة</th><th>الاعتماد</th><th>أهلية النوتة</th></tr></thead><tbody>
        ${students.map(s => {
          const summary = summarizeMonth(s.id);
          const confessionCount = summary.days ? dailyNotes.filter(n => String(n.studentId) === String(s.id) && String(n.noteDate || '').startsWith(month) && n.items?.confession).length : 0;
          const communionCount = summary.days ? dailyNotes.filter(n => String(n.studentId) === String(s.id) && String(n.noteDate || '').startsWith(month) && n.items?.communion).length : 0;
          const eligible = summary.days > 0 && summary.itemStats.every(x => x.key === 'confession' || x.key === 'communion' || x.percent >= 65) && confessionCount >= 1 && communionCount >= 2;
          const monthRecords = dailyNotes.filter(n => String(n.studentId) === String(s.id) && String(n.noteDate || '').startsWith(month));
          const approvedCount = monthRecords.filter(n => n.reviewStatus === 'approved').length;
          return `<tr><td>${Helpers.escapeHtml(s.name)}<br><code>${Helpers.escapeHtml(s.id)}</code></td><td>${summary.days}</td>${summary.itemStats.map(x => `<td><strong>${x.percent}%</strong><br><small>${x.done} يومًا</small></td>`).join('')}<td><span class="badge ${approvedCount === monthRecords.length && monthRecords.length ? 'badge-success' : 'badge-info'}">${approvedCount}/${monthRecords.length} معتمد</span></td><td>${canApproveMonthlyNotes() && approvedCount < monthRecords.length ? `<button class="btn btn-outline btn-sm" onclick="approveMonthlySpiritualNotes('${s.id}')">اعتماد الشهر</button>` : approvedCount === monthRecords.length && monthRecords.length ? 'معتمد' : '—'}</td><td><span class="badge ${eligible ? 'badge-success' : 'badge-danger'}">${eligible ? 'مؤهل' : 'غير مؤهل'}${confessionCount ? '' : ' - الاعتراف'}</span></td></tr>`;
        }).join('')}
        </tbody></table></div>`}
    </div>
  `;
}

function filterNotesStudents(value) {
  State.activeTab['notes_search'] = value;
  clearTimeout(window._notesSearchTimer);
  window._notesSearchTimer = setTimeout(() => renderApp(), 250);
}

function canApproveMonthlyNotes() {
  if (State.currentUser?.type === 'admin') return true;
  const servant = State.currentUser?.data;
  return State.currentUser?.type === 'servant' && (Helpers.canApproveSpiritualNotes(servant) || Helpers.canAddVisitationNotes(servant));
}

async function approveMonthlySpiritualNotes(studentId) {
  if (!canApproveMonthlyNotes()) return showToast('ليس لديك صلاحية اعتماد النوتة', 'error');
  const month = State.activeTab['notes_month'] || new Date().toISOString().slice(0, 7);
  const records = AppData.visitationNotes.filter(n =>
    n.type === 'spiritualDaily' &&
    String(n.studentId) === String(studentId) &&
    String(n.noteDate || '').startsWith(month) &&
    n.reviewStatus !== 'approved'
  );
  if (!records.length) return showToast('لا توجد سجلات تنتظر الاعتماد لهذا الشهر', 'warning');
  try {
    showLoading('جارٍ اعتماد النوتة الشهرية...');
    await Promise.all(records.map(async note => {
      await DB.updateVisitationNote(note.id, {
        reviewStatus: 'approved',
        reviewedBy: State.currentUser?.data?.name || State.currentUser?.email || 'مسؤول معتمد',
        reviewedAt: new Date().toISOString()
      });
      note.reviewStatus = 'approved';
    }));
    showToast(`✅ تم اعتماد ${records.length} سجل شهري`);
    closeModal();
    renderApp();
  } catch (error) {
    console.error(error);
    showToast('تعذر اعتماد النوتة الشهرية', 'error');
  } finally { hideLoading(); }
}

function openSpiritualNoteModal(studentId) {
  const student = AppData.students.find(s => String(s.id) === String(studentId));
  if (!student) return;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isoLocal = date => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  };
  const selectedDate = State.activeTab['spiritual_note_date'] || isoLocal(today);
  const existing = AppData.visitationNotes.find(n => n.type === 'spiritualDaily' && String(n.studentId) === String(studentId) && n.noteDate === selectedDate);
  const items = existing?.items || {};
  const isApproved = existing?.reviewStatus === 'approved';
  const isAdminApprovalContext = canApproveMonthlyNotes();
  const studentEntry = State.currentUser?.type === 'student';
  const dateBounds = studentEntry ? `min="${isoLocal(yesterday)}" max="${isoLocal(today)}"` : '';
  const labels = {
    gospel: 'قراءة الإنجيل', morningPrayer: 'صلاة باكر', eveningPrayer: 'صلاة الغروب',
    nightPrayer: 'صلاة النوم', communion: 'التناول', confession: 'الاعتراف'
  };
  showModal(`
    <h3>📔 نوتة ${Helpers.escapeHtml(student.name)} الروحية</h3>
    <div class="form-grid">
      <div><strong>الكود:</strong> <code>${Helpers.escapeHtml(student.id)}</code></div>
      <div><strong>الدفعة:</strong> دفعة ${Helpers.escapeHtml(student.batchYear || student.classGroup || '—')}</div>
    </div>
    <div class="form-group" style="margin-top:12px"><label>التاريخ</label><input type="date" id="spiritualNoteDate" value="${selectedDate}" ${dateBounds} onchange="reloadSpiritualNote('${studentId}', this.value)"></div>
    <div class="form-section">
      <div class="section-header">بنود اليوم</div>
      ${Object.entries(labels).map(([key, label]) => `<label style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee"><input type="checkbox" id="spiritual_${key}" ${items[key] === true ? 'checked' : ''}><span>${label}</span></label>`).join('')}
    </div>
    <div class="form-group"><label>ملاحظات الخادم</label><textarea id="spiritualNoteText" rows="3">${Helpers.escapeHtml(existing?.text || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-gold" onclick="saveSpiritualNote('${studentId}')">💾 حفظ النوتة اليومية</button>
      ${isAdminApprovalContext && existing?.id && !isApproved ? `<button class="btn btn-outline" onclick="approveSpiritualNote('${existing.id}', '${studentId}')">✅ اعتماد النوتة</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
}

function openStudentSpiritualNoteModal(studentId) {
  State.activeTab['spiritual_note_date'] = new Date().toISOString().slice(0, 10);
  openSpiritualNoteModal(studentId);
}

async function approveSpiritualNote(noteId, studentId) {
  try {
    await DB.updateVisitationNote(noteId, {
      reviewStatus: 'approved',
      reviewedBy: State.currentUser?.data?.name || State.currentUser?.email || 'مسؤول معتمد',
      reviewedAt: new Date().toISOString()
    });
    const note = AppData.visitationNotes.find(n => n.id === noteId);
    if (note) Object.assign(note, { reviewStatus: 'approved' });
    closeModal();
    showToast('✅ تم اعتماد النوتة الروحية');
    renderApp();
  } catch (error) {
    console.error(error);
    showToast('❌ تعذر اعتماد النوتة', 'error');
  }
}

function reloadSpiritualNote(studentId, noteDate) {
  State.activeTab['spiritual_note_date'] = noteDate;
  openSpiritualNoteModal(studentId);
}

async function saveSpiritualNote(studentId) {
  const noteDate = document.getElementById('spiritualNoteDate').value;
  if (!noteDate) return showToast('اختر تاريخ النوتة', 'error');
  const student = AppData.students.find(s => String(s.id) === String(studentId));
  const keys = ['gospel', 'morningPrayer', 'eveningPrayer', 'nightPrayer', 'communion', 'confession'];
  const items = {};
  keys.forEach(key => { items[key] = document.getElementById(`spiritual_${key}`).checked; });
  const existing = AppData.visitationNotes.find(n => n.type === 'spiritualDaily' && String(n.studentId) === String(studentId) && n.noteDate === noteDate);
  if (existing?.reviewStatus === 'approved' && State.currentUser?.type === 'student') {
    showToast('⚠️ النوتة المعتمدة تحتاج طلب تصحيح من المسؤول', 'warning');
    return;
  }
  const data = {
    studentId, studentName: student?.name || '', noteDate, type: 'spiritualDaily',
    category: 'spiritual', items, text: document.getElementById('spiritualNoteText').value.trim(),
    reviewStatus: existing?.reviewStatus || 'draft',
    classGroup: student?.batchYear || student?.classGroup || ''
  };
  try {
    showLoading('جارٍ حفظ النوتة...');
    let saved;
    if (existing?.id) {
      await DB.updateVisitationNote(existing.id, data);
      Object.assign(existing, data);
    } else {
      saved = await DB.addVisitationNote(data);
      AppData.visitationNotes.push(saved);
    }
    closeModal();
    showToast('✅ تم حفظ النوتة اليومية');
    renderApp();
  } catch (e) {
    console.error(e);
    showToast('❌ فشل حفظ النوتة', 'error');
  } finally { hideLoading(); }
}

function openSpiritualNoteRules() {
  showModal(`
    <h3>⚙️ شروط أهلية النوتة للامتحان</h3>
    <div class="info-msg">يتم احتساب النسب تلقائيًا من الأيام المسجلة ولا يمكن إدخال نسب يدوية.</div>
    <div class="form-grid" style="margin-top:12px">
      <div><strong>قراءة الإنجيل والصلاة:</strong><br>65% على الأقل لكل شهر</div>
      <div><strong>قراءة الإنجيل والصلاة:</strong><br>21 يومًا على الأقل شهريًا لكل بند</div>
      <div><strong>التناول:</strong><br>مرتان على الأقل كل شهر</div>
      <div><strong>الاعتراف:</strong><br>مرة واحدة على الأقل كل شهر</div>
      <div><strong>عدم تقديم النوتة:</strong><br>عدم تقديمها لمدة 3 أشهر يمنع الأهلية</div>
      <div><strong>التعويض:</strong><br>يطبق بموافقة مسجلة من مسؤول معتمد</div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">إغلاق</button></div>
  `);
}

function renderAdminReports() {
  const reports = [
    ['general', '👥', 'التقرير العام للطلاب والدفعات والكتب'],
    ['studentFile', '📁', 'تقرير ملف الطالب والسجل الأكاديمي'],
    ['attendance', '📋', 'تقرير الحضور والغياب'],
    ['eligibility', '✅', 'تقرير أهلية الامتحانات'],
    ['dailyNote', '📔', 'تقرير النوتة الروحية اليومية'],
    ['monthlyNote', '📅', 'تقرير النوتة الشهرية لكل طالب'],
    ['termNote', '📊', 'تقرير النوتة الفصلية والنسب الإجمالية'],
    ['sacraments', '🕯️', 'تقرير الاعتراف والتناول'],
    ['mass', '⛪', 'تقرير حضور القداس والتسبحة'],
    ['assignments', '📝', 'تقرير الواجبات والأبحاث وحالة التسليم'],
    ['servicePreparation', '🎓', 'تقرير تقييم وتحضير دروس الخدمة'],
    ['coursework', '📈', 'تقرير أعمال السنة'],
    ['biblicalCompetition', '📖', 'تقرير مسابقات الكتاب المقدس'],
    ['curriculumCompetition', '🏆', 'تقرير مسابقات كتاب المنهج'],
    ['coptic', '🔤', 'تقرير اللغة القبطية'],
    ['morningPrayer', '🌅', 'تقرير تسميع صلاة باكر'],
    ['exams', '✍️', 'تقرير الامتحانات والنتائج'],
    ['failedRetried', '🔄', 'تقرير الراسبين والمعيدين'],
    ['transfers', '↔️', 'تقرير انتقالات الطلاب بين الدفعات والكتب'],
    ['servants', '👨‍🏫', 'تقرير الخدام والتكليفات والتقييمات'],
    ['decisions', '⚖️', 'تقرير القرارات والاستثناءات'],
    ['gradeChanges', '✏️', 'تقرير تعديل الدرجات والصلاحيات والاعتمادات'],
    ['imports', '📥', 'تقرير عمليات الاستيراد من Excel'],
    ['sync', '🔧', 'تقرير الأعطال والمزامنة والتغييرات']
  ];
  return `
    <div class="card">
      <div class="flex-between mb-2">
        <div class="card-title">🖨️ قائمة التقارير المعتمدة</div>
        <button class="btn btn-outline btn-sm" onclick="printAllReports()">📄 طباعة الكشاف العام</button>
      </div>
      <div class="gold-line"></div>
      <div class="reports-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:16px">
        ${reports.map(([type, icon, title], index) => `
          <div class="report-section" style="margin:0;padding:14px">
            <div style="font-weight:700;margin-bottom:10px"><span style="color:#b89120">${index + 1}</span> ${icon} ${Helpers.escapeHtml(title)}</div>
            <button class="btn btn-gold btn-sm" onclick="printSystemReport('${type}')">🖨️ عرض وطباعة</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
function renderSystemManagement() {
  return `
    <div class="card mb-2">
      <div class="card-title">🔑 تغيير كلمة مرور المسؤول</div>
      <div class="gold-line"></div>
      <div class="form-group"><label>كلمة المرور الحالية *</label><input type="password" id="adminCurrentPassword"></div>
      <div class="form-grid">
        <div class="form-group"><label>كلمة المرور الجديدة *</label><input type="password" id="adminNewPassword" placeholder="6 أحرف على الأقل"></div>
        <div class="form-group"><label>تأكيد كلمة المرور *</label><input type="password" id="adminConfirmPassword"></div>
      </div>
      <button class="btn btn-primary" onclick="changeAdminPassword()">🔑 تغيير كلمة المرور</button>
    </div>
    
    <div class="card mb-2">
      <div class="card-title">💾 النسخ الاحتياطي</div>
      <div class="gold-line"></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="icon">👥</div><div class="num">${AppData.students.length}</div><div class="lbl">دارس</div></div>
        <div class="stat-card"><div class="icon">👨‍🏫</div><div class="num">${AppData.servants.length}</div><div class="lbl">خادم</div></div>
        <div class="stat-card"><div class="icon">📋</div><div class="num">${AppData.attendance.length}</div><div class="lbl">حضور</div></div>
        <div class="stat-card"><div class="icon">📊</div><div class="num">${AppData.evaluations.length}</div><div class="lbl">تقييم</div></div>
      </div>
      <div class="flex gap-1 mt-2" style="flex-wrap:wrap;">
        <button class="btn btn-success" onclick="backupFullData()">💾 إنشاء نسخة احتياطية</button>
        <button class="btn btn-outline" onclick="document.getElementById('restoreFile').click()">📥 استعادة</button>
        <input type="file" id="restoreFile" accept=".json" style="display:none" onchange="restoreFullData(this)">
      </div>
    </div>
    
    <div class="card mb-2">
      <div class="card-title">📤 تصدير البيانات</div>
      <div class="gold-line"></div>
      <div class="flex gap-1" style="flex-wrap:wrap;">
        <button class="btn btn-gold" onclick="exportStudentsExcel()">📊 الدارسين</button>
        <button class="btn btn-gold" onclick="exportAllGradesExcel()">📊 الدرجات الكاملة</button>
        <button class="btn btn-gold" onclick="exportServantsExcel()">📊 الخدام</button>
        <button class="btn btn-gold" onclick="exportAttendanceExcel()">📊 الحضور</button>
        <button class="btn btn-gold" onclick="exportEvaluationsExcel()">📊 أعمال السنة</button>
        <button class="btn btn-gold" onclick="exportExamsExcel()">📊 الامتحانات</button>
        <button class="btn btn-print" onclick="exportPDF()">📄 PDF</button>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-title">📚 مواد كتاب المنهج</div>
      <div class="gold-line"></div>
      <div class="info-msg">المواد الافتراضية تخص الكتاب الأول والثالث. كل امتحان افتراضيًا من 30 سؤالًا. يمكن تخصيص أي مادة لكتاب واحد أو أكثر، وتحديد دخولها في المجموع والمسابقات.</div>
      <div id="curriculumSubjectsEditor" style="display:grid;gap:10px;margin-top:14px">
        ${AppData.subjects.map((subject, index) => `
          <div class="curriculum-subject-row" style="display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(220px,1fr) 90px repeat(2,auto) auto;gap:8px;align-items:center;padding:10px;border:1px solid var(--border-color);border-radius:10px">
            <input type="text" class="subject-name" value="${Helpers.escapeHtml(subject.label || '')}" placeholder="اسم المادة" data-index="${index}">
            <select class="subject-books" multiple size="2" data-index="${index}" title="الكتب المرتبطة بالمادة">
              ${STUDY_BOOKS.map(book => `<option value="${book}" ${subject.books?.includes(book) ? 'selected' : ''}>${book}</option>`).join('')}
            </select>
            <input type="number" class="subject-exam-questions" min="1" value="${parseInt(subject.examQuestions) || 30}" title="عدد أسئلة الامتحان">
            <label><input type="checkbox" class="subject-count-total" ${subject.countInTotal !== false ? 'checked' : ''}> تدخل في المجموع</label>
            <label><input type="checkbox" class="subject-competition" ${subject.competition !== false ? 'checked' : ''}> تدخل في المسابقة</label>
            <button type="button" class="btn btn-outline btn-sm" onclick="this.closest('.curriculum-subject-row').remove()">🗑️</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-outline mt-2" type="button" onclick="addCurriculumSubject()">➕ إضافة مادة أخرى</button>
    </div>
    
    <div class="card mb-2">
      <div class="card-title">📅 إعدادات الترم</div>
      <div class="gold-line"></div>
      <div class="form-grid">
        <div class="form-group"><label>اسم المركز</label><input type="text" id="setCenterName" value="${AppData.settings.centerName || ''}"></div>
        <div class="form-group"><label>الشعار</label><input type="text" id="setSlogan" value="${AppData.settings.slogan || ''}"></div>
        <div class="form-group"><label>بداية الترم</label><input type="date" id="settingsStart" value="${AppData.settings.termStart || ''}"></div>
        <div class="form-group"><label>نهاية الترم</label><input type="date" id="settingsEnd" value="${AppData.settings.termEnd || ''}"></div>
        <div class="form-group"><label>عدد الأسابيع</label><input type="number" id="settingsWeeks" value="${AppData.settings.totalWeeks || 15}" min="1" max="30"></div>
        <div class="form-group"><label>الأسبوع الحالي</label><input type="number" id="settingsCurrentWeek" value="${AppData.settings.currentWeek || 1}" min="1" max="30"></div>
        <div class="form-group"><label>عدد أعمال السنة</label><input type="number" id="settingsTotalEval" value="${AppData.settings.totalEvaluations || 10}" min="1" max="30"></div>
      </div>
      <button class="btn btn-primary mt-2" onclick="saveSettings()">💾 حفظ الإعدادات</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">📋 سياسة الحضور والأهلية</div>
      <div class="gold-line"></div>
      <div class="info-msg">تُحفظ نسخ السياسة عند كل تعديل، ولا يعاد حساب السجلات القديمة تلقائيًا.</div>
      <div class="form-grid">
        <div class="form-group"><label>نسبة الأهلية الأعلى من</label><input type="number" id="attendanceEligibility" min="0" max="100" value="${AppData.settings.attendancePolicy?.eligibilityPercent ?? ATTENDANCE_POLICY_DEFAULT.eligibilityPercent}">%</div>
        <div class="form-group"><label>الغياب المتقطع للتنبيه</label><input type="number" id="attendanceInterrupted" min="1" value="${AppData.settings.attendancePolicy?.warningInterrupted ?? 7}"></div>
        <div class="form-group"><label>الغياب المتتالي للتنبيه</label><input type="number" id="attendanceConsecutive" min="1" value="${AppData.settings.attendancePolicy?.warningConsecutive ?? 4}"></div>
        <div class="form-group"><label>لحظة ربع غياب - المحاضرة الأولى</label><input type="time" id="lecture1Quarter" value="${AppData.settings.attendancePolicy?.lecture1?.quarterAfter || '18:30'}"></div>
        <div class="form-group"><label>غياب المحاضرة الأولى</label><input type="time" id="lecture1Absent" value="${AppData.settings.attendancePolicy?.lecture1?.absenceAt || '19:00'}"></div>
        <div class="form-group"><label>لحظة ربع غياب - المحاضرة الثانية</label><input type="time" id="lecture2Quarter" value="${AppData.settings.attendancePolicy?.lecture2?.quarterAfter || '19:30'}"></div>
        <div class="form-group"><label>غياب المحاضرة الثانية</label><input type="time" id="lecture2Absent" value="${AppData.settings.attendancePolicy?.lecture2?.absenceAt || '20:00'}"></div>
        <div class="form-group"><label>طريقة اللحظة الفاصلة</label><select id="attendanceBoundary"><option value="after" ${(AppData.settings.attendancePolicy?.compareBoundary || 'after') === 'after' ? 'selected' : ''}>تدخل في الفترة التالية (بعد الدقيقة المحددة)</option><option value="at" ${(AppData.settings.attendancePolicy?.compareBoundary) === 'at' ? 'selected' : ''}>تدخل في الفترة عند الدقيقة المحددة</option></select></div>
        <div class="form-group"><label>وزن الحضور في اليوم</label><input type="number" id="attendanceWeight" min="0" max="100" value="${AppData.settings.attendancePolicy?.attendanceWeight ?? 50}">%</div>
        <div class="form-group"><label>وزن الأسئلة في اليوم</label><input type="number" id="questionsWeight" min="0" max="100" value="${AppData.settings.attendancePolicy?.questionsWeight ?? 50}">%</div>
      </div>
      <button class="btn btn-primary mt-2" onclick="saveAttendancePolicy()">💾 اعتماد نسخة السياسة</button>
      <button class="btn btn-outline mt-2" onclick="viewAttendancePolicyHistory()">📜 نسخ السياسات السابقة</button>
    </div>
    
    <div class="danger-zone">
      <h3>🚨 إعادة ضبط النظام</h3>
      <div class="danger-msg">⚠️ <strong>تحذير!</strong> هذه العمليات لا يمكن التراجع عنها.</div>
      <h4 style="margin-top:16px;">اختر ما تريد حذفه:</h4>
      <label class="danger-checkbox"><input type="checkbox" id="del_students"><span>👨‍🎓 <strong>جميع الدارسين</strong> (${AppData.students.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_servants"><span>👨‍🏫 <strong>جميع الخدام</strong> (${AppData.servants.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_attendance"><span>📋 <strong>جميع بيانات الحضور</strong> (${AppData.attendance.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_evaluations"><span>📊 <strong>جميع أعمال السنة</strong> (${AppData.evaluations.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_exams"><span>🎓 <strong>جميع درجات الامتحانات</strong> (${AppData.exams.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_notes"><span>📔 <strong>جميع ملاحظات النوتة الروحية</strong> (${AppData.visitationNotes.length})</span></label>
      <label class="danger-checkbox"><input type="checkbox" id="del_logs"><span>📜 <strong>سجل العمليات</strong> (${AppData.logs.length})</span></label>
      <div class="form-group mt-3">
        <label>اكتب "<strong>تأكيد الحذف</strong>" للمتابعة:</label>
        <input type="text" id="confirmDelete" placeholder="تأكيد الحذف">
      </div>
      <button class="btn btn-danger btn-lg" onclick="executeSystemReset()">🚨 تنفيذ الحذف</button>
    </div>
  `;
}

/* ============================================================
   EVENT HANDLERS
   ============================================================ */
async function handleLogin(role) {
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';
  try {
    showLoading('جارٍ التحقق...');
    const email = role === 'student'
      ? document.getElementById('studentEmail')?.value.trim()
      : role === 'servant'
        ? document.getElementById('servantEmail')?.value.trim()
        : document.getElementById('adminUsername')?.value.trim();
    const password = role === 'student'
      ? document.getElementById('studentPassword')?.value
      : role === 'servant'
        ? document.getElementById('servantPassword')?.value
        : document.getElementById('adminPassword')?.value;
    if (!email || !password) { hideLoading(); showLoginError('أدخل البريد الإلكتروني وكلمة المرور'); return; }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userSnapshot = await getDoc(doc(db, 'users', credential.user.uid));
    const profile = userSnapshot.exists() ? userSnapshot.data() : null;
    if (!profile || profile.active === false) {
      await signOut(auth);
      const reason = profile === null
        ? `الحساب مسجل في Authentication ولكن لا يوجد مستند Firestore بالمفتاح UID التالي:\n${credential.user.uid}`
        : 'ملف المستخدم موجود، لكن الحقل active ليس true.';
      showLoginError(reason);
      return;
    }
    const adminRoles = ['service_admin', 'control_admin', 'priest', 'monitor', 'admin'];
    const roleMatches = role === 'admin' ? adminRoles.includes(profile.role) : profile.role === role;
    if (!roleMatches) { await signOut(auth); showLoginError('نوع الحساب لا يطابق صفحة الدخول'); return; }
    const profileId = profile.profileId;
    const data = profile.role === 'student'
      ? AppData.students.find(s => s.id === profileId || s.uid === credential.user.uid) || { id: profileId, name: profile.name, uid: credential.user.uid }
      : profile.role === 'servant'
        ? AppData.servants.find(s => s.id === profileId || s.uid === credential.user.uid) || { id: profileId, name: profile.name, uid: credential.user.uid }
        : { ...profile, id: credential.user.uid, name: profile.name };
    State.setUser({ type: role, role: profile.role, data });
    await SessionTracker.startSession({ type: role, role: profile.role, data });
    State.setPage('dashboard');
    showToast('مرحباً بك في نظام إعداد الخدام');
  } catch (e) {
    console.error(e);
    if (e?.code === 'permission-denied' || e?.code === 'unavailable') {
      showLoginError('تعذّر الاتصال بقاعدة البيانات. عطّل مانع الإعلانات لهذه الصفحة أو تحقق من اتصال الإنترنت.');
    } else if (e?.code === 'auth/user-not-found' || e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential') {
      showLoginError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } else {
      showLoginError('حدث خطأ أثناء تسجيل الدخول');
    }
  }
  finally { hideLoading(); }
}
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function switchLoginTab(role) {
  const c = document.getElementById('loginFormContainer');
  document.querySelectorAll('#loginTabs button').forEach(t => t.classList.remove('active'));
  document.querySelector(`#loginTabs button[data-role="${role}"]`).classList.add('active');
  if (role === 'student') c.innerHTML = renderStudentLoginForm();
  else if (role === 'servant') c.innerHTML = renderServantLoginForm();
  else if (role === 'admin') c.innerHTML = renderAdminLoginForm();
  const err = document.getElementById('loginError');
  if (err) err.style.display = 'none';
}

async function changeWeek(w) {
  AppData.settings.currentWeek = parseInt(w);
  await DB.setSettings(AppData.settings);
  renderApp();
}

function markAllPresent() {
  document.querySelectorAll('select[name$="_lecture_1"], select[name$="_lecture_2"]').forEach(select => { if (!select.disabled) select.value = 'present'; });
  document.querySelectorAll('input[type="radio"][value="present"]').forEach(r => { if (!r.disabled) r.checked = true; });
  showToast('✅ تم تحديد الجميع كحاضر', 'info');
}
function markAllAbsent() {
  document.querySelectorAll('select[name$="_lecture_1"], select[name$="_lecture_2"]').forEach(select => { if (!select.disabled) select.value = 'absent'; });
  document.querySelectorAll('input[type="radio"][value="absent"]').forEach(r => { if (!r.disabled) r.checked = true; });
  showToast('⚠️ تم تحديد الجميع كغائب', 'warning');
}

async function saveAttendanceBulk(week) {
  const records = [];
  const studentIds = new Set(Array.from(document.querySelectorAll('select[name^="att_"][name$="_lecture_1"]')).map(input => input.name.split('_lecture_')[0].replace('att_', '')));
  if (!studentIds.size) {
    document.querySelectorAll('input[type="radio"][name^="att_"]:checked:not(:disabled)').forEach(input => studentIds.add(input.name.replace('att_', '')));
  }
  if (!studentIds.size) { showToast('⚠️ لم يتم تحديد أي طالب', 'warning'); return; }
  studentIds.forEach(studentId => {
    const reason = document.querySelector(`input[name="att_reason_${studentId}"]`)?.value.trim() || '';
    [1, 2].forEach(lecture => {
      const select = document.querySelector(`select[name="att_${studentId}_lecture_${lecture}"]`);
      if (select && !select.disabled) {
        records.push({
          studentId, week, studyDay: week, lecture, status: select.value, type: 'attendance',
          changeReason: reason, policyVersion: AppData.settings.attendancePolicy?.version || 1,
          changedBy: State.currentUser?.data?.name || 'System', changedAt: new Date().toISOString()
        });
      }
    });
  });
  try {
    showLoading(`جارٍ حفظ ${records.length} سجل...`);
    await DB.saveAttendanceBulk(records);
    for (const record of records) {
      await DB.addLog({
        action: 'تعديل حضور',
        studentId: record.studentId,
        details: `الأسبوع ${record.week} - المحاضرة ${record.lecture}: ${AttendanceEngine.statusLabel(record.status)}${record.changeReason ? ` - السبب: ${record.changeReason}` : ''}`,
        policyVersion: record.policyVersion
      });
    }
    records.forEach(r => {
      const idx = AppData.attendance.findIndex(a => a.studentId === r.studentId && a.week === r.week && Number(a.lecture) === Number(r.lecture) && a.type === 'attendance');
      if (idx !== -1) AppData.attendance[idx] = { ...AppData.attendance[idx], ...r };
      else AppData.attendance.push(r);
    });
    showToast(`✅ تم حفظ ${records.length} سجل حضور`);
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function saveQuickEvaluations(subject, week) {
  const inputs = document.querySelectorAll('.quick-eval-input');
  const records = [];
  inputs.forEach(input => {
    const score = parseInt(input.value);
    if (!isNaN(score) && score >= 1 && score <= 10) records.push({ studentId: input.dataset.student, subject, week, score });
  });
  if (records.length === 0) { showToast('⚠️ لا توجد درجات', 'warning'); return; }
  try {
    showLoading(`جارٍ حفظ ${records.length} تقييم...`);
    await DB.saveEvaluationsBulk(records);
    records.forEach(r => {
      const idx = AppData.evaluations.findIndex(e => e.studentId === r.studentId && e.subject === r.subject && e.week === r.week);
      if (idx !== -1) AppData.evaluations[idx] = { ...AppData.evaluations[idx], ...r };
      else AppData.evaluations.push(r);
    });
    showToast(`✅ تم حفظ ${records.length} تقييم`);
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function saveExamsBulk(subject) {
  const inputs = document.querySelectorAll('.exam-input');
  const weights = GRADING_SYSTEM.getWeights(subject);
  const records = [];
  inputs.forEach(input => {
    const score = parseFloat(input.value);
    if (!isNaN(score) && score >= 0 && score <= weights.exam) records.push({ studentId: input.dataset.student, subject, score, examType: 'final', maxScore: weights.exam });
  });
  if (records.length === 0) { showToast('⚠️ لا توجد درجات', 'warning'); return; }
  try {
    showLoading(`جارٍ حفظ ${records.length} امتحان...`);
    await DB.saveExamsBulk(records);
    records.forEach(r => {
      const idx = AppData.exams.findIndex(e => e.studentId === r.studentId && e.subject === r.subject && e.examType === r.examType);
      if (idx !== -1) AppData.exams[idx] = { ...AppData.exams[idx], ...r };
      else AppData.exams.push(r);
    });
    showToast(`✅ تم حفظ ${records.length} امتحان`);
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function changeServantPassword(id) {
  const cur = document.getElementById('currentPassword').value.trim();
  const np = document.getElementById('newPassword').value.trim();
  const cp = document.getElementById('confirmPassword').value.trim();
  const s = AppData.servants.find(x => x.id === id);
  if (!s) return;
  if (cur !== s.password) { showToast('❌ كلمة المرور الحالية غير صحيحة', 'error'); return; }
  if (np.length < 4) { showToast('⚠️ 4 أحرف على الأقل', 'error'); return; }
  if (np !== cp) { showToast('⚠️ غير متطابقتين', 'error'); return; }
  try {
    showLoading('جارٍ الحفظ...');
    await DB.updateServant(id, { password: np });
    s.password = np;
    if (State.currentUser?.type === 'servant') {
      State.currentUser.data.password = np;
      DB.setSession(State.currentUser);
    }
    showToast('✅ تم التغيير');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function changeAdminPassword() {
  const current = document.getElementById('adminCurrentPassword').value.trim();
  const newPass = document.getElementById('adminNewPassword').value.trim();
  const confirmPass = document.getElementById('adminConfirmPassword').value.trim();
  const admin = State.currentUser?.data;
  if (!admin) return;
  if (!current) { showToast('⚠️ أدخل كلمة المرور الحالية', 'error'); return; }
  if (current !== admin.password) { showToast('❌ كلمة المرور الحالية غير صحيحة', 'error'); return; }
  if (!newPass || newPass.length < 6) { showToast('⚠️ 6 أحرف على الأقل', 'error'); return; }
  if (newPass !== confirmPass) { showToast('⚠️ غير متطابقتين', 'error'); return; }
  try {
    showLoading('جارٍ التغيير...');
    await setDoc(doc(db, COLLECTIONS.ADMINS, admin.id), { password: newPass, updatedAt: serverTimestamp() }, { merge: true });
    admin.password = newPass;
    State.currentUser.data.password = newPass;
    DB.setSession(State.currentUser);
    document.getElementById('adminCurrentPassword').value = '';
    document.getElementById('adminNewPassword').value = '';
    document.getElementById('adminConfirmPassword').value = '';
    showToast('✅ تم تغيير كلمة المرور');
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

function updateDeaconOptions(p) {
  const g = document.getElementById(`${p}StudentGender`).value;
  const sel = document.getElementById(`${p}StudentDeacon`);
  const cur = sel.value;
  sel.innerHTML = `<option value="">-- اختر --</option><option value="أبصالطس">أبصالطس</option><option value="أغنسطس">أغنسطس</option><option value="لم يتم الرسامة">لم يتم الرسامة</option>${g === 'أنثى' ? '<option value="غير مطلوب">غير مطلوب</option>' : ''}`;
  if (cur) sel.value = cur;
}

/* ============================================================
   ✅ استمارة إضافة دارس جديدة شاملة (8 أقسام)
   ============================================================ */
async function openAddStudentModal() {
  showLoading('جارٍ توليد الكود...');
  try {
    const code = await DB.generateStudentCode();
    hideLoading();
    const curUser = State.currentUser;
    let adderName = 'غير محدد';
    if (curUser?.type === 'servant') adderName = curUser.data.name;
    else if (curUser?.type === 'admin') adderName = curUser.data.name || 'الأدمن';
    
    showModal(`
      <h3>👤 إضافة دارس جديد</h3>
      
      <div class="code-display">
        <div class="code-label">كود الدارس (تلقائي)</div>
        <div class="code-value" id="newStudentCodeDisplay">${code}</div>
        <div class="code-actions">
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);" onclick="copyToClipboard('${code}')">📋 نسخ</button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);" onclick="regenerateStudentCode()">🔄 تغيير</button>
        </div>
      </div>
      
      <div class="info-msg" style="font-size:0.82rem;">
        📌 <strong>سيتم تسجيل الدارس باسمك:</strong> ${adderName}
      </div>
      
      <input type="hidden" id="addStudentCode" value="${code}">
      
      <div class="form-section">
        <div class="section-header">📋 البيانات الشخصية</div>
        <div class="form-group">
          <label>الاسم الكامل *</label>
          <input type="text" id="addStudentName" placeholder="أدخل اسم الدارس بالكامل">
        </div>
        <div class="form-group">
          <label>البريد الإلكتروني *</label>
          <input type="email" id="addStudentEmail" autocomplete="email" placeholder="name@example.com">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>النوع *</label>
            <select id="addStudentGender" onchange="updateDeaconOptions('add')">
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </div>
          <div class="form-group">
            <label>تاريخ الميلاد</label>
            <input type="date" id="addStudentBirth">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>الرقم القومي</label>
            <input type="text" id="addStudentNationalId" placeholder="14 رقم" maxlength="14">
          </div>
          <div class="form-group">
            <label>المدرسة / الوظيفة</label>
            <input type="text" id="addStudentSchool" placeholder="اسم المدرسة أو الوظيفة">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">📚 البيانات الدراسية</div>
        <div class="form-grid">
          <div class="form-group">
            <label>المرحلة الدراسية *</label>
            <select id="addStudentStage">
              <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
              <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
              <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
              <option value="شباب">شباب</option>
              <option value="خريجين">خريجين</option>
              <option value="أولياء أمور">أولياء أمور</option>
            </select>
          </div>
          <div class="form-group">
            <label>الدفعة *</label>
            <select id="addStudentClassGroup">
              ${Array.from({ length: new Date().getFullYear() - 2016 }, (_, i) => 2017 + i).reverse().map(year => `<option value="${year}">${year}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>الكتاب الدراسي *</label>
            <select id="addStudentClass">
              <option value="الكتاب الأول">الكتاب الأول</option>
              <option value="الكتاب الثاني">الكتاب الثاني</option>
              <option value="الكتاب الثالث">الكتاب الثالث</option>
              <option value="الكتاب الرابع">الكتاب الرابع</option>
            </select>
          </div>
          <div class="form-group">
            <label>رتبة الشماسية</label>
            <select id="addStudentDeacon">
              <option value="">-- اختر --</option>
              <option value="أبصالطس">أبصالطس</option>
              <option value="أغنسطس">أغنسطس</option>
              <option value="لم يتم الرسامة">لم يتم الرسامة</option>
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>المستوى الدراسي</label>
            <select id="addStudentLevel">
              <option value="مبتدئ">مبتدئ</option>
              <option value="متوسط">متوسط</option>
              <option value="متقدم">متقدم</option>
              <option value="متفوق">متفوق</option>
            </select>
          </div>
          <div class="form-group">
            <label>حالة الدارس</label>
            <select id="addStudentAcademicStatus">
              ${Helpers.getStudentStatuses().map(status => `<option value="${status}" ${status === 'نشط' ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>نظام التسجيل</label>
            <select id="addStudentIsNew">
              <option value="جديد">نظام جديد</option>
              <option value="قديم">نظام قديم</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">📞 بيانات الاتصال</div>
        <div class="form-grid">
          <div class="form-group">
            <label>هاتف الدارس *</label>
            <input type="tel" id="addStudentPhone1" placeholder="01xxxxxxxxx">
          </div>
          <div class="form-group">
            <label>هاتف ولي الأمر</label>
            <input type="tel" id="addStudentPhone2" placeholder="01xxxxxxxxx">
          </div>
        </div>
        <div class="form-group">
          <label>هاتف إضافي</label>
          <input type="tel" id="addStudentPhone3" placeholder="01xxxxxxxxx">
        </div>
        <div class="form-group">
          <label>العنوان بالتفصيل</label>
          <textarea id="addStudentAddress" rows="2" placeholder="المحافظة - المدينة - الشارع - رقم العقار"></textarea>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">👨‍👩‍👧 بيانات الأسرة</div>
        <div class="form-grid">
          <div class="form-group">
            <label>اسم الأب</label>
            <input type="text" id="addStudentFather" placeholder="اسم الأب">
          </div>
          <div class="form-group">
            <label>اسم الأم</label>
            <input type="text" id="addStudentMother" placeholder="اسم الأم">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>هاتف الأب</label>
            <input type="tel" id="addStudentFatherPhone" placeholder="01xxxxxxxxx">
          </div>
          <div class="form-group">
            <label>هاتف الأم</label>
            <input type="tel" id="addStudentMotherPhone" placeholder="01xxxxxxxxx">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>عدد الأخوات</label>
            <input type="number" id="addStudentSiblings" min="0" value="0">
          </div>
          <div class="form-group">
            <label>ترتيب الدارس</label>
            <input type="number" id="addStudentOrder" min="1" value="1">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">⛪ البيانات الكنسية</div>
        <div class="form-group">
          <label>الكنيسة التابع لها</label>
          <input type="text" id="addStudentChurch" placeholder="اسم الكنيسة">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>الأب الكاهن المسؤول</label>
            <input type="text" id="addStudentPriest" placeholder="اسم الأب الكاهن">
          </div>
          <div class="form-group">
            <label>المنطقة الكنسية</label>
            <input type="text" id="addStudentChurchArea" placeholder="المنطقة">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">📎 المستندات</div>
        <div class="form-grid">
          <div class="form-group">
            <label>📷 الصورة الشخصية</label>
            <input type="file" id="addStudentPhoto" accept="image/*">
          </div>
          <div class="form-group">
            <label>📄 صورة الاستمارة</label>
            <input type="file" id="addStudentFormPhoto" accept="image/*">
          </div>
        </div>
        <div class="form-group">
          <label>📋 شهادة الميلاد</label>
          <input type="file" id="addStudentBirthCert" accept="image/*,application/pdf">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>📘 البطاقة (وجه)</label>
            <input type="file" id="addStudentIdFront" accept="image/*">
          </div>
          <div class="form-group">
            <label>📘 البطاقة (ظهر)</label>
            <input type="file" id="addStudentIdBack" accept="image/*">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">✅ حالة الاستمارة والدفع</div>
        <div class="checkbox-group">
          <input type="checkbox" id="addStudentForm">
          <label>تم استلام الاستمارة الورقية</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="addStudentPaid">
          <label>تم دفع رسوم الاشتراك</label>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>المبلغ المدفوع</label>
            <input type="number" id="addStudentPaidAmount" min="0" value="0">
          </div>
          <div class="form-group">
            <label>تاريخ الدفع</label>
            <input type="date" id="addStudentPaidDate">
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">📝 ملاحظات إضافية</div>
        <div class="form-group">
          <textarea id="addStudentNotes" rows="3" placeholder="أي ملاحظات إضافية..."></textarea>
        </div>
      </div>
      
      <div class="modal-actions" style="position:sticky;bottom:0;background:white;padding-top:16px;border-top:2px solid var(--gray-light);margin-top:20px;">
        <button class="btn btn-gold" onclick="saveNewStudent()" style="flex:1;">💾 حفظ الدارس</button>
        <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
      </div>
    `, 'lg');
  } catch (e) { 
    hideLoading(); 
    showToast('❌ فشل توليد الكود', 'error'); 
  }
}

async function regenerateStudentCode() {
  try {
    const c = await DB.generateStudentCode();
    document.getElementById('addStudentCode').value = c;
    document.getElementById('newStudentCodeDisplay').textContent = c;
    showToast('🔄 تم تغيير الكود');
  } catch (e) {}
}

function copyToClipboard(text) { navigator.clipboard.writeText(text).then(() => showToast('📋 تم النسخ')); }

async function saveNewStudent() {
  const code = document.getElementById('addStudentCode').value.trim().toUpperCase();
  const name = document.getElementById('addStudentName').value.trim();
  const email = document.getElementById('addStudentEmail').value.trim().toLowerCase();
  const phone1 = document.getElementById('addStudentPhone1').value.trim();
  
  if (!name) { showToast('⚠️ أدخل اسم الدارس', 'error'); return; }
  if (!email || !email.includes('@')) { showToast('⚠️ أدخل بريدًا إلكترونيًا صحيحًا', 'error'); return; }
  if (!phone1) { showToast('⚠️ أدخل هاتف الدارس', 'error'); return; }
  if (!code || !CodeGenerator.isValidStudentCode(code)) { showToast('❌ الكود غير صالح', 'error'); return; }

  try {
    const allCodes = await DB.getAllCodes();
    if (allCodes.has(code)) { showToast('❌ الكود مستخدم', 'error'); await regenerateStudentCode(); return; }

    const cur = State.currentUser;
    let addedByName = 'غير محدد', addedByType = '';
    if (cur?.type === 'servant') { addedByName = cur.data.name; addedByType = 'خادم'; }
    else if (cur?.type === 'admin') { addedByName = cur.data.name || 'الأدمن'; addedByType = 'مسؤول'; }

    showLoading('جارٍ حفظ الدارس...');
    
    const secondaryCredential = await createUserWithEmailAndPassword(studentRegistrationAuth, email, code);
    const studentUid = secondaryCredential.user.uid;
    await signOut(studentRegistrationAuth);
    await setDoc(doc(db, 'users', studentUid), {
      active: true,
      role: 'student',
      name,
      email,
      profileId: code,
      createdAt: serverTimestamp()
    });

    const student = {
      id: code, name, email, uid: studentUid, type: 'جديد',
      gender: document.getElementById('addStudentGender').value,
      birthdate: document.getElementById('addStudentBirth').value,
      nationalId: document.getElementById('addStudentNationalId').value.trim(),
      school: document.getElementById('addStudentSchool').value.trim(),
      stage: document.getElementById('addStudentStage').value,
      classGroup: document.getElementById('addStudentClassGroup').value,
      class: document.getElementById('addStudentClass').value,
      academicYear: document.getElementById('addStudentStage').value,
      batchYear: document.getElementById('addStudentClassGroup').value,
      studyBook: document.getElementById('addStudentClass').value,
      status: document.getElementById('addStudentAcademicStatus').value,
      deaconRank: document.getElementById('addStudentDeacon').value,
      level: document.getElementById('addStudentLevel').value,
      isNew: document.getElementById('addStudentIsNew').value,
      phone1,
      phone2: document.getElementById('addStudentPhone2').value.trim(),
      phone3: document.getElementById('addStudentPhone3').value.trim(),
      address: document.getElementById('addStudentAddress').value.trim(),
      fatherName: document.getElementById('addStudentFather').value.trim(),
      motherName: document.getElementById('addStudentMother').value.trim(),
      fatherPhone: document.getElementById('addStudentFatherPhone').value.trim(),
      motherPhone: document.getElementById('addStudentMotherPhone').value.trim(),
      siblings: parseInt(document.getElementById('addStudentSiblings').value) || 0,
      order: parseInt(document.getElementById('addStudentOrder').value) || 1,
      church: document.getElementById('addStudentChurch').value.trim(),
      priest: document.getElementById('addStudentPriest').value.trim(),
      churchArea: document.getElementById('addStudentChurchArea').value.trim(),
      formReceived: document.getElementById('addStudentForm').checked,
      formPaid: document.getElementById('addStudentPaid').checked,
      paidAmount: parseFloat(document.getElementById('addStudentPaidAmount').value) || 0,
      paidDate: document.getElementById('addStudentPaidDate').value,
      notes: document.getElementById('addStudentNotes').value.trim(),
      addedByName, addedByType,
      addedAt: new Date().toISOString()
    };
    
    await DB.addStudent(student);
    AppData.students.push(student);
    DB.addLog({ action: 'إضافة دارس', target: name, details: `الكود: ${code} - بواسطة: ${addedByName}` });
    
    closeModal();
    showToast(`✅ تمت إضافة الدارس - الكود: ${code}`);
    renderApp();
  } catch (e) {
    console.error(e);
    const message = e?.code === 'auth/email-already-in-use'
      ? 'البريد الإلكتروني مسجل بالفعل'
      : e?.code === 'permission-denied'
        ? 'ليس لديك صلاحية إنشاء حساب الدارس'
        : e?.message || 'حدث خطأ غير متوقع';
    showToast('❌ فشل الحفظ: ' + message, 'error');
  } finally { hideLoading(); }
}

function openEditStudentModal(id) {
  const s = AppData.students.find(x => x.id === id);
  if (!s) return;
  showModal(`
    <h3>✏️ تعديل بيانات الدارس</h3>
    <div class="info-msg"><strong>الكود:</strong> ${s.id} • <strong>أضيف بواسطة:</strong> ${Helpers.getStudentAdder(s)}</div>
    
    <div class="form-section">
      <div class="section-header">📋 البيانات الشخصية</div>
      <div class="form-group"><label>الاسم الكامل</label><input type="text" id="editStudentName" value="${s.name || ''}"></div>
      <div class="form-group"><label>البريد الإلكتروني</label><input type="email" id="editStudentEmail" autocomplete="email" value="${s.email || ''}"></div>
      <div class="form-grid">
        <div class="form-group"><label>النوع</label><select id="editStudentGender"><option value="ذكر" ${s.gender === 'ذكر' ? 'selected' : ''}>ذكر</option><option value="أنثى" ${s.gender === 'أنثى' ? 'selected' : ''}>أنثى</option></select></div>
        <div class="form-group"><label>الميلاد</label><input type="date" id="editStudentBirth" value="${s.birthdate || ''}"></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>الرقم القومي</label><input type="text" id="editStudentNationalId" value="${s.nationalId || ''}" maxlength="14"></div>
        <div class="form-group"><label>المدرسة / الوظيفة</label><input type="text" id="editStudentSchool" value="${s.school || ''}"></div>
      </div>
    </div>
    
    <div class="form-section">
      <div class="section-header">📚 البيانات الدراسية</div>
      <div class="form-grid">
        <div class="form-group"><label>السنة الدراسية</label><select id="editStudentStage">${Array.from({ length: 6 }, (_, i) => { const start = new Date().getFullYear() - i; const year = `${start}/${start + 1}`; return `<option value="${year}" ${year === (s.academicYear || s.stage) ? 'selected' : ''}>${year}</option>`; }).join('')}</select></div>
        <div class="form-group"><label>الدفعة</label><select id="editStudentClassGroup">${Array.from({ length: new Date().getFullYear() - 2016 }, (_, i) => 2017 + i).reverse().map(year => `<option value="${year}" ${String(year) === String(s.batchYear || s.classGroup) ? 'selected' : ''}>${year}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>الكتاب الدراسي</label><select id="editStudentClass">${['الكتاب الأول', 'الكتاب الثاني', 'الكتاب الثالث', 'الكتاب الرابع'].map(book => `<option value="${book}" ${book === (s.studyBook || s.class) ? 'selected' : ''}>${book}</option>`).join('')}</select></div>
        <div class="form-group"><label>رتبة الشماسية</label><select id="editStudentDeacon">${Helpers.getDeaconRanks(s.gender).map(r => `<option value="${r}" ${r === s.deaconRank ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>حالة الدارس</label><select id="editStudentStatus">${Helpers.getStudentStatuses().map(status => `<option value="${status}" ${(s.status || 'نشط') === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>
        <div class="form-group"><label>فترة التخرج (نيروز / ختام)</label><input type="text" id="editStudentGraduationName" value="${s.graduationName || ''}" placeholder="خريج نيروز - 2024"></div>
      </div>
      ${s.status === 'راسب' || s.status === 'مستكمل' ? `
      <div class="info-msg">📌 تم حفظ نتيجة المحاولة الحالية. عند إضافة إعادة، سيتم إنشاء محاولة جديدة دون حذف التقييمات والحضور والنوتة السابقة.</div>
      <div class="form-grid">
        <div class="form-group"><label>دفعة إعادة الدراسة</label><select id="editStudentRetryBatch">${Helpers.getBatchYears().map(year => `<option value="${year}" ${String(year) === String(s.retryBatchYear) ? 'selected' : ''}>دفعة ${year}</option>`).join('')}</select></div>
        <div class="form-group"><label>الترم</label><select id="editStudentRetryTerm"><option value="الترم الأول" ${s.retryTerm === 'الترم الأول' ? 'selected' : ''}>الترم الأول</option><option value="الترم الثاني" ${s.retryTerm === 'الترم الثاني' ? 'selected' : ''}>الترم الثاني</option></select></div>
      </div>` : ''}
    </div>
    
    <div class="form-section">
      <div class="section-header">📞 بيانات الاتصال</div>
      <div class="form-grid">
        <div class="form-group"><label>هاتف 1</label><input type="tel" id="editStudentPhone1" value="${s.phone1 || ''}"></div>
        <div class="form-group"><label>هاتف 2</label><input type="tel" id="editStudentPhone2" value="${s.phone2 || ''}"></div>
      </div>
      <div class="form-group"><label>العنوان</label><textarea id="editStudentAddress" rows="2">${s.address || ''}</textarea></div>
    </div>
    
    <div class="form-section">
      <div class="section-header">👨‍👩‍👧 بيانات الأسرة</div>
      <div class="form-grid">
        <div class="form-group"><label>اسم الأب</label><input type="text" id="editStudentFather" value="${s.fatherName || ''}"></div>
        <div class="form-group"><label>اسم الأم</label><input type="text" id="editStudentMother" value="${s.motherName || ''}"></div>
      </div>
    </div>
    
    <div class="form-section">
      <div class="section-header">⛪ البيانات الكنسية</div>
      <div class="form-group"><label>الكنيسة</label><input type="text" id="editStudentChurch" value="${s.church || ''}"></div>
      <div class="form-grid">
        <div class="form-group"><label>الأب الكاهن</label><input type="text" id="editStudentPriest" value="${s.priest || ''}"></div>
        <div class="form-group"><label>المنطقة</label><input type="text" id="editStudentChurchArea" value="${s.churchArea || ''}"></div>
      </div>
    </div>
    
    <div class="form-section">
      <div class="section-header">✅ حالة الاستمارة والدفع</div>
      <div class="checkbox-group"><input type="checkbox" id="editStudentForm" ${s.formReceived ? 'checked' : ''}><label>تم استلام الاستمارة</label></div>
      <div class="checkbox-group"><input type="checkbox" id="editStudentPaid" ${s.formPaid ? 'checked' : ''}><label>تم الدفع</label></div>
      <div class="form-grid">
        <div class="form-group"><label>المبلغ المدفوع</label><input type="number" id="editStudentPaidAmount" value="${s.paidAmount || 0}" min="0"></div>
        <div class="form-group"><label>تاريخ الدفع</label><input type="date" id="editStudentPaidDate" value="${s.paidDate || ''}"></div>
      </div>
    </div>
    
    <div class="form-section">
      <div class="section-header">📝 ملاحظات</div>
      <div class="form-group"><textarea id="editStudentNotes" rows="3">${s.notes || ''}</textarea></div>
    </div>
    
    <div class="modal-actions" style="position:sticky;bottom:0;background:white;padding-top:16px;border-top:2px solid var(--gray-light);">
      <button class="btn btn-gold" onclick="updateStudentData('${s.id}')" style="flex:1;">💾 حفظ التعديلات</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `, 'lg');
}

async function updateStudentData(id) {
  const existingStudent = AppData.students.find(student => student.id === id) || {};
  const updates = {
    name: document.getElementById('editStudentName').value.trim(),
    email: document.getElementById('editStudentEmail').value.trim().toLowerCase(),
    gender: document.getElementById('editStudentGender').value,
    birthdate: document.getElementById('editStudentBirth').value,
    nationalId: document.getElementById('editStudentNationalId').value.trim(),
    school: document.getElementById('editStudentSchool').value.trim(),
    stage: document.getElementById('editStudentStage').value,
    classGroup: document.getElementById('editStudentClassGroup').value,
    class: document.getElementById('editStudentClass').value,
    academicYear: document.getElementById('editStudentStage').value,
    batchYear: document.getElementById('editStudentClassGroup').value,
    studyBook: document.getElementById('editStudentClass').value,
    status: document.getElementById('editStudentStatus').value,
    graduationName: document.getElementById('editStudentGraduationName').value.trim(),
    retryBatchYear: document.getElementById('editStudentRetryBatch')?.value || existingStudent.retryBatchYear || '',
    retryTerm: document.getElementById('editStudentRetryTerm')?.value || existingStudent.retryTerm || '',
    deaconRank: document.getElementById('editStudentDeacon').value,
    phone1: document.getElementById('editStudentPhone1').value.trim(),
    phone2: document.getElementById('editStudentPhone2').value.trim(),
    address: document.getElementById('editStudentAddress').value.trim(),
    fatherName: document.getElementById('editStudentFather').value.trim(),
    motherName: document.getElementById('editStudentMother').value.trim(),
    church: document.getElementById('editStudentChurch').value.trim(),
    priest: document.getElementById('editStudentPriest').value.trim(),
    churchArea: document.getElementById('editStudentChurchArea').value.trim(),
    formReceived: document.getElementById('editStudentForm').checked,
    formPaid: document.getElementById('editStudentPaid').checked,
    paidAmount: parseFloat(document.getElementById('editStudentPaidAmount').value) || 0,
    paidDate: document.getElementById('editStudentPaidDate').value,
    notes: document.getElementById('editStudentNotes').value.trim()
  };
  if (!updates.name) { showToast('⚠️ أدخل الاسم', 'error'); return; }
  if (!updates.email || !updates.email.includes('@')) { showToast('⚠️ أدخل بريدًا إلكترونيًا صحيحًا', 'error'); return; }
  try {
    showLoading('جارٍ الحفظ...');
    if (updates.status === 'راسب' || updates.status === 'مستكمل') {
      const attempts = existingStudent.academicAttempts || [];
      const attemptKey = `${existingStudent.academicYear || existingStudent.stage || ''}-${existingStudent.studyBook || existingStudent.class || ''}-${attempts.length + 1}`;
      if (!attempts.some(attempt => attempt.key === attemptKey)) {
        attempts.push({
          key: attemptKey,
          studentId: id,
          academicYear: existingStudent.academicYear || existingStudent.stage || '',
          term: existingStudent.currentTerm || AppData.settings.currentTerm || '',
          book: existingStudent.studyBook || existingStudent.class || '',
          originalBatchYear: existingStudent.batchYear || existingStudent.classGroup || '',
          retryBatchYear: updates.retryBatchYear || '',
          status: updates.status,
          updatedAt: new Date().toISOString()
        });
        updates.academicAttempts = attempts;
      }
    }
    await DB.updateStudent(id, updates);
    const idx = AppData.students.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(AppData.students[idx], updates);
    closeModal();
    showToast('✅ تم التحديث');
    renderApp();
  } catch (e) { showToast('❌ فشل الحفظ', 'error'); }
  finally { hideLoading(); }
}

async function deleteStudentConfirm(id) {
  if (!confirm('حذف الدارس؟')) return;
  try {
    await DB.deleteStudent(id);
    AppData.students = AppData.students.filter(s => s.id !== id);
    showToast('🗑️ تم');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
}

function openStudentFile(id) {
  const student = AppData.students.find(s => String(s.id) === String(id));
  if (!student) {
    showToast('لم يتم العثور على ملف الطالب', 'error');
    return;
  }
  const matchesStudent = record => {
    const value = `${record.studentId || ''}|${record.studentCode || ''}|${record.studentName || ''}|${record.name || ''}`;
    return String(record.studentId || '') === String(student.id) ||
      String(record.studentCode || '') === String(student.id) ||
      String(record.studentName || record.name || '') === String(student.name || '');
  };
  const formatFileDate = value => {
    if (!value) return '—';
    if (typeof value === 'object' && value.seconds != null) value = new Date(value.seconds * 1000);
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString('ar-EG');
  };
  const recordCard = (row, type) => {
    if (!row || typeof row !== 'object') return String(row || '—');
    const status = row.status || row.result || row.score;
    const label = row.subject ? Helpers.getSubjectLabel(row.subject) : '';
    return `${type}${row.id || row.registrationId || row.attemptId ? ` • رقم السجل: ${row.id || row.registrationId || row.attemptId}` : ''}
      ${label ? ` • المادة: ${label}` : ''}
      ${row.week ? ` • الأسبوع: ${row.week}` : ''}
      ${row.studyBook || row.book ? ` • الكتاب: ${row.studyBook || row.book}` : ''}
      ${row.batchYear || row.classGroup ? ` • الدفعة: ${row.batchYear || row.classGroup}` : ''}
      ${row.term ? ` • الفصل: ${row.term}` : ''}
      ${status !== undefined ? ` • النتيجة/الحالة: ${status}` : ''}
      ${row.score !== undefined ? ` • الدرجة: ${row.score}` : ''}
      ${row.text ? ` • ${row.text}` : ''}
      ${row.category ? ` • التصنيف: ${Helpers.getCategoryLabel(row.category)}` : ''}
      ${row.createdAt ? ` • التاريخ: ${formatFileDate(row.createdAt)}` : ''}
      ${row.date ? ` • التاريخ: ${formatFileDate(row.date)}` : ''}`;
  };
  const section = (title, rows, type = '') => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">${title}</div><div class="gold-line"></div>
      ${rows && rows.length ? rows.map(row => `<div style="padding:7px 0;border-bottom:1px solid #eee">${Helpers.escapeHtml(recordCard(row, type)).replace(/\n/g, '<br>')}</div>`).join('') : '<div class="empty-state" style="padding:12px">لا توجد بيانات مسجلة</div>'}
    </div>`;
  const attempts = Array.isArray(student.academicAttempts) ? student.academicAttempts : [];
  const records = Array.isArray(student.academicRecords) ? student.academicRecords : [];
  const attendance = AppData.attendance.filter(matchesStudent);
  const evaluations = AppData.evaluations.filter(matchesStudent);
  const exams = AppData.exams.filter(matchesStudent);
  const notes = AppData.visitationNotes.filter(matchesStudent);
  showModal(`
    <div class="flex-between"><h3>📁 ملف الطالب الأكاديمي</h3><button class="btn btn-outline btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="form-grid">
      <div><strong>الاسم:</strong> ${Helpers.escapeHtml(student.name || '—')}</div>
      <div><strong>الكود:</strong> <code>${Helpers.escapeHtml(student.id || '—')}</code></div>
      <div><strong>البريد:</strong> ${Helpers.escapeHtml(student.email || '—')}</div>
      <div><strong>الهاتف:</strong> ${Helpers.escapeHtml(student.phone1 || student.phone || '—')}</div>
      <div><strong>الحالة:</strong> ${Helpers.studentStatusBadge(student.status)}</div>
      <div><strong>الدفعة الأصلية:</strong> ${Helpers.escapeHtml(String(student.batchYear || student.classGroup || '—'))}</div>
      <div><strong>الكتاب الحالي:</strong> ${Helpers.escapeHtml(student.studyBook || student.class || '—')}</div>
      <div><strong>تاريخ الالتحاق:</strong> ${Helpers.escapeHtml(formatFileDate(student.joinDate || student.enrollmentDate || student.createdAt))}</div>
    </div>
    <div class="gold-line" style="margin:15px 0"></div>
    ${section('📚 التسجيلات الدراسية والمحاولات', records.length || attempts.length ? [
      ...records.map(r => ({ 'تسجيل دراسي': r.id || r.registrationId || '—', ...r })),
      ...attempts.map(r => ({ 'محاولة كتاب': r.id || r.attemptId || '—', ...r }))
    ] : [])}
    ${section('📋 الحضور والغياب', attendance, 'حضور')}
    ${section('📖 النوتة الروحية والملاحظات', notes, 'ملاحظة روحية')}
    ${section('📝 الواجبات والتقييمات', evaluations, 'تقييم')}
    ${section('📄 أعمال السنة والامتحانات والنتائج', exams, 'امتحان')}
    ${section('🔄 النقل، الإعادة والاستثناءات والتاريخ الأكاديمي', [
      ...(student.transferHistory || []).map(x => ({ نوع: 'نقل', ...x })),
      ...(student.retryHistory || []).map(x => ({ نوع: 'إعادة دراسة', ...x })),
      ...(student.exceptions || []).map(x => ({ نوع: 'استثناء', ...x })),
      ...(student.academicHistory || []).map(x => ({ نوع: 'قرار أكاديمي', ...x })),
      student.graduationName ? { نوع: 'تخرج/خروج', بيان: student.graduationName, year: student.graduationYear } : null,
      student.withdrawalDate ? { نوع: 'انسحاب/انقطاع', تاريخ: student.withdrawalDate } : null
    ].filter(Boolean))}
  `);
}

/* Servants */
async function openAddServantModal() {
  showLoading('جارٍ توليد الكود...');
  try {
    const code = await DB.generateServantCode();
    hideLoading();
    showModal(`
      <h3>👨‍🏫 إضافة خادم جديد</h3>
      <div class="code-display">
        <div class="code-label">كود الخادم (تلقائي)</div>
        <div class="code-value" id="newServantCodeDisplay">${code}</div>
        <div class="code-actions"><button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;" onclick="copyToClipboard('${code}')">📋 نسخ</button></div>
      </div>
      <input type="hidden" id="addServantCode" value="${code}">
      
      <div class="form-section">
        <div class="section-header">👤 البيانات الأساسية</div>
        <div class="form-group"><label>اسم الخادم *</label><input type="text" id="addServantName" placeholder="الاسم الكامل"></div>
        <div class="form-grid">
          <div class="form-group"><label>الهاتف *</label><input type="tel" id="addServantPhone" placeholder="01xxxxxxxxx"></div>
          <div class="form-group"><label>كلمة المرور *</label><input type="text" id="addServantPassword" value="1234"></div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">🏫 الفصول المسؤول عنها</div>
        <div class="classes-grid">
          <button type="button" class="class-checkbox-btn all-btn" id="add_all_class_btn" onclick="toggleAllClassesBtn(this)"><span>📋 الكل</span></button>
          ${Helpers.getClassGroups().map(g => `<button type="button" class="class-checkbox-btn" data-class="${g}" onclick="toggleClassBtn(this)"><span>${g}</span></button>`).join('')}
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">📚 المواد التي يدرسها</div>
        <div class="subjects-grid">
          ${Helpers.getSubjects().map(s => `<label class="subject-checkbox"><input type="checkbox" class="add-servant-subject" value="${s.value}"><span>${s.icon} ${s.label}</span></label>`).join('')}
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">⚙️ الأدوار الإدارية</div>
        <div class="roles-grid">
          ${Helpers.getServantAdminRolesList().map(r => `<label class="role-option" style="border-right-color:${r.color};"><input type="checkbox" class="add-servant-admin-role" value="${r.value}"><div><div class="role-title" style="color:${r.color};">${r.label}</div><div class="role-desc">${r.description}</div></div></label>`).join('')}
        </div>
      </div>
      
      <div class="modal-actions">
        <button class="btn btn-gold" onclick="saveNewServant()" style="flex:1;">💾 حفظ</button>
        <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
      </div>
    `, 'lg');
  } catch (e) { hideLoading(); showToast('❌ فشل', 'error'); }
}

function toggleAllClassesBtn(el) {
  el.classList.toggle('checked');
  document.querySelectorAll('#add_all_class_btn ~ .class-checkbox-btn').forEach(btn => btn.classList.remove('checked'));
}
function toggleClassBtn(el) {
  el.classList.toggle('checked');
  document.getElementById('add_all_class_btn')?.classList.remove('checked');
}

async function saveNewServant() {
  const name = document.getElementById('addServantName').value.trim();
  const code = document.getElementById('addServantCode').value.trim().toUpperCase();
  const phone = document.getElementById('addServantPhone').value.trim();
  const pass = document.getElementById('addServantPassword').value.trim();
  if (!name || !phone || !pass) { showToast('أكمل البيانات', 'error'); return; }
  const classes = [];
  if (document.getElementById('add_all_class_btn')?.classList.contains('checked')) classes.push('الكل');
  else document.querySelectorAll('#add_all_class_btn ~ .class-checkbox-btn.checked').forEach(btn => classes.push(btn.dataset.class));
  if (classes.length === 0) { showToast('اختر فصل', 'error'); return; }
  const subjects = [];
  document.querySelectorAll('.add-servant-subject:checked').forEach(c => subjects.push(c.value));
  const roles = [];
  document.querySelectorAll('.add-servant-admin-role:checked').forEach(c => roles.push(c.value));
  if (subjects.length === 0 && roles.length === 0) { showToast('اختر مادة أو دور', 'error'); return; }
  try {
    const allCodes = await DB.getAllCodes();
    if (allCodes.has(code)) { showToast('❌ الكود مستخدم', 'error'); return; }
    const servant = { id: 'SRV' + Date.now(), name, code, phone, password: pass, classGroup: classes.includes('الكل') ? 'الكل' : classes, subjectSpecialty: subjects, adminRole: roles };
    showLoading('جارٍ الحفظ...');
    await DB.addServant(servant);
    AppData.servants.push(servant);
    closeModal();
    showToast(`✅ الكود: ${code}`);
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

function openEditServantModal(id) {
  const s = AppData.servants.find(x => x.id === id);
  if (!s) return;
  const subjects = Array.isArray(s.subjectSpecialty) ? s.subjectSpecialty : (s.subjectSpecialty ? [s.subjectSpecialty] : []);
  const roles = Array.isArray(s.adminRole) ? s.adminRole : (s.adminRole ? [s.adminRole] : []);
  const sClasses = Helpers.getServantClassGroups(s);
  const isAll = s.classGroup === 'الكل';
  showModal(`
    <h3>✏️ تعديل الخادم</h3>
    <div class="form-section">
      <div class="section-header">👤 البيانات الأساسية</div>
      <div class="form-group"><label>الاسم</label><input type="text" id="editServantName" value="${s.name}"></div>
      <div class="form-grid">
        <div class="form-group"><label>الهاتف</label><input type="tel" id="editServantPhone" value="${s.phone || ''}"></div>
        <div class="form-group"><label>كلمة المرور</label><input type="text" id="editServantPassword" value="${s.password}"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="section-header">🏫 الفصول المسؤول عنها</div>
      <div class="classes-grid">
        <button type="button" class="class-checkbox-btn all-btn ${isAll ? 'checked' : ''}" id="edit_all_class_btn" onclick="toggleEditAllClassesBtn(this)"><span>📋 الكل</span></button>
        ${Helpers.getClassGroups().map(g => `<button type="button" class="class-checkbox-btn ${sClasses.includes(g) && !isAll ? 'checked' : ''}" data-class="${g}" onclick="toggleEditClassBtn(this)"><span>${g}</span></button>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="section-header">📚 المواد</div>
      <div class="subjects-grid">
        ${Helpers.getSubjects().map(sub => `<label class="subject-checkbox ${subjects.includes(sub.value) ? 'checked' : ''}"><input type="checkbox" class="edit-servant-subject" value="${sub.value}" ${subjects.includes(sub.value) ? 'checked' : ''}><span>${sub.icon} ${sub.label}</span></label>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="section-header">⚙️ الأدوار</div>
      <div class="roles-grid">
        ${Helpers.getServantAdminRolesList().map(r => `<label class="role-option" style="border-right-color:${r.color};"><input type="checkbox" class="edit-servant-admin-role" value="${r.value}" ${roles.includes(r.value) ? 'checked' : ''}><div><div class="role-title" style="color:${r.color};">${r.label}</div><div class="role-desc">${r.description}</div></div></label>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-gold" onclick="updateServantData('${s.id}')" style="flex:1;">💾 حفظ</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `, 'lg');
}

function toggleEditAllClassesBtn(el) {
  el.classList.toggle('checked');
  document.querySelectorAll('#edit_all_class_btn ~ .class-checkbox-btn').forEach(btn => btn.classList.remove('checked'));
}
function toggleEditClassBtn(el) {
  el.classList.toggle('checked');
  document.getElementById('edit_all_class_btn')?.classList.remove('checked');
}

async function updateServantData(id) {
  const classes = [];
  if (document.getElementById('edit_all_class_btn')?.classList.contains('checked')) classes.push('الكل');
  else document.querySelectorAll('#edit_all_class_btn ~ .class-checkbox-btn.checked').forEach(btn => classes.push(btn.dataset.class));
  if (classes.length === 0) { showToast('اختر فصل', 'error'); return; }
  const subjects = [];
  document.querySelectorAll('.edit-servant-subject:checked').forEach(c => subjects.push(c.value));
  const roles = [];
  document.querySelectorAll('.edit-servant-admin-role:checked').forEach(c => roles.push(c.value));
  const updates = {
    name: document.getElementById('editServantName').value.trim(),
    phone: document.getElementById('editServantPhone').value.trim(),
    password: document.getElementById('editServantPassword').value.trim(),
    classGroup: classes.includes('الكل') ? 'الكل' : classes,
    subjectSpecialty: subjects, adminRole: roles
  };
  try {
    showLoading('جارٍ الحفظ...');
    await DB.updateServant(id, updates);
    const idx = AppData.servants.findIndex(s => s.id === id);
    if (idx !== -1) Object.assign(AppData.servants[idx], updates);
    closeModal();
    showToast('✅ تم');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function deleteServantConfirm(id) {
  if (!confirm('حذف الخادم؟')) return;
  try {
    await DB.deleteServant(id);
    AppData.servants = AppData.servants.filter(s => s.id !== id);
    showToast('🗑️ تم');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
}

function openNotesModal(studentId, studentName, week) {
  const notes = AppData.visitationNotes.filter(n => n.studentId === studentId && n.week === week);
  const name = State.currentUser?.data?.name || 'خادم';
  const canAdd = State.currentUser?.type === 'servant' ? Helpers.canAddVisitationNotes(State.currentUser.data) : true;
  showModal(`
    <h3>📔 ملاحظات - ${studentName}</h3>
    ${notes.length > 0 ? `<div style="max-height:250px;overflow-y:auto;margin-bottom:12px;">${notes.map(n => `
      <div class="note-card"><div class="note-header"><span class="badge badge-info">${Helpers.getCategoryLabel(n.category)}</span><span>${Helpers.formatDateTime(n.createdAt)}</span></div><div class="note-body">${Helpers.escapeHtml(n.text)}</div></div>
    `).join('')}</div>` : ''}
    ${canAdd ? `
      <hr><h4>➕ إضافة</h4>
      <div class="form-group"><label>التصنيف</label><select id="noteCategory">${Helpers.getNoteCategories().map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></div>
      <div class="form-group"><label>الملاحظة</label><textarea id="noteText" rows="3"></textarea></div>
      <div class="modal-actions">
        <button class="btn btn-gold" onclick="saveNote('${studentId}', ${week}, '${name.replace(/'/g, "\\'")}')">💾 حفظ</button>
        <button class="btn btn-outline" onclick="closeModal()">إغلاق</button>
      </div>
    ` : `<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">إغلاق</button></div>`}
  `);
}

async function saveNote(studentId, week, servantName) {
  const cat = document.getElementById('noteCategory').value;
  const text = document.getElementById('noteText').value.trim();
  if (!text) { showToast('اكتب الملاحظة', 'error'); return; }
  try {
    const saved = await DB.addVisitationNote({ studentId, week, category: cat, text, servantName, classGroup: AppData.students.find(s => s.id === studentId)?.classGroup || '' });
    AppData.visitationNotes.push(saved);
    closeModal();
    showToast('✅ تم');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
}

async function forceLogoutUser(sessionId, userName) {
  if (!confirm(`هل تريد إخراج "${userName}" من النظام؟`)) return;
  try {
    showLoading('جارٍ إخراج المستخدم...');
    await SessionTracker.forceLogout(sessionId);
    DB.addLog({ action: 'إخراج مستخدم', target: userName, details: 'إخراج قسري بواسطة المسؤول' });
    showToast(`✅ تم إخراج "${userName}" من النظام`);
    renderApp();
  } catch (e) { showToast('❌ فشل الإخراج', 'error'); }
  finally { hideLoading(); }
}

async function cleanupSessions() {
  if (!confirm('هل تريد تنظيف الجلسات القديمة (أكثر من 5 دقائق)؟')) return;
  try {
    showLoading('جارٍ التنظيف...');
    await SessionTracker.cleanupOldSessions();
    showToast('✅ تم تنظيف الجلسات القديمة');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

function addCurriculumSubject() {
  const editor = document.getElementById('curriculumSubjectsEditor');
  if (!editor) return;
  const row = document.createElement('div');
  row.className = 'curriculum-subject-row';
  row.style.cssText = 'display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(220px,1fr) 90px repeat(2,auto) auto;gap:8px;align-items:center;padding:10px;border:1px solid var(--border-color);border-radius:10px';
  row.innerHTML = `
    <input type="text" class="subject-name" value="" placeholder="اسم المادة الجديدة">
    <select class="subject-books" multiple size="2" title="الكتب المرتبطة بالمادة">
      ${STUDY_BOOKS.map(book => `<option value="${book}" ${book === 'الكتاب الأول' ? 'selected' : ''}>${book}</option>`).join('')}
    </select>
    <input type="number" class="subject-exam-questions" min="1" value="30" title="عدد أسئلة الامتحان">
    <label><input type="checkbox" class="subject-count-total" checked> تدخل في المجموع</label>
    <label><input type="checkbox" class="subject-competition" checked> تدخل في المسابقة</label>
    <button type="button" class="btn btn-outline btn-sm" onclick="this.closest('.curriculum-subject-row').remove()">🗑️</button>
  `;
  editor.appendChild(row);
  row.querySelector('.subject-name').focus();
}

function collectCurriculumSubjects() {
  const subjects = [];
  document.querySelectorAll('#curriculumSubjectsEditor .curriculum-subject-row').forEach((row, index) => {
    const name = row.querySelector('.subject-name')?.value.trim();
    if (!name) return;
    const valueBase = name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `subject-${index + 1}`;
    const selectedBooks = Array.from(row.querySelector('.subject-books')?.selectedOptions || []).map(option => option.value);
    subjects.push(normalizeSubject({
      id: `${valueBase}-${index + 1}`,
      value: `${valueBase}-${index + 1}`,
      label: name,
      icon: '📚',
      books: selectedBooks.length ? selectedBooks : ['الكتاب الأول'],
      examQuestions: parseInt(row.querySelector('.subject-exam-questions')?.value) || 30,
      countInTotal: row.querySelector('.subject-count-total')?.checked === true,
      competition: row.querySelector('.subject-competition')?.checked === true
    }));
  });
  return subjects;
}

async function saveSettings() {
  const subjects = collectCurriculumSubjects();
  const settings = {
    centerName: document.getElementById('setCenterName')?.value || AppData.settings.centerName,
    slogan: document.getElementById('setSlogan')?.value || AppData.settings.slogan,
    termStart: document.getElementById('settingsStart')?.value,
    termEnd: document.getElementById('settingsEnd')?.value,
    totalWeeks: parseInt(document.getElementById('settingsWeeks')?.value) || 15,
    currentWeek: parseInt(document.getElementById('settingsCurrentWeek')?.value) || 1,
    totalEvaluations: parseInt(document.getElementById('settingsTotalEval')?.value) || 10,
    subjects
  };
  try {
    showLoading('جارٍ الحفظ...');
    await DB.setSettings(settings);
    AppData.settings = { ...AppData.settings, ...settings };
    AppData.subjects = subjects.map(normalizeSubject);
    showToast('✅ تم');
    renderApp();
  } catch (e) { showToast('❌ فشل', 'error'); }
  finally { hideLoading(); }
}

async function saveAttendancePolicy() {
  const policy = {
    version: (parseInt(AppData.settings.attendancePolicy?.version) || 0) + 1,
    effectiveFrom: new Date().toISOString(),
    eligibilityPercent: Math.max(0, Math.min(100, parseInt(document.getElementById('attendanceEligibility').value) || 65)),
    warningInterrupted: parseInt(document.getElementById('attendanceInterrupted').value) || 7,
    warningConsecutive: parseInt(document.getElementById('attendanceConsecutive').value) || 4,
    attendanceWeight: parseInt(document.getElementById('attendanceWeight').value) || 50,
    questionsWeight: parseInt(document.getElementById('questionsWeight').value) || 50,
    compareBoundary: document.getElementById('attendanceBoundary').value,
    lecture1: { quarterAfter: document.getElementById('lecture1Quarter').value, absenceAt: document.getElementById('lecture1Absent').value },
    lecture2: { quarterAfter: document.getElementById('lecture2Quarter').value, absenceAt: document.getElementById('lecture2Absent').value }
  };
  if (policy.attendanceWeight + policy.questionsWeight !== 100) { showToast('يجب أن يكون مجموع وزن الحضور والأسئلة 100%', 'error'); return; }
  if (policy.lecture1.quarterAfter >= policy.lecture1.absenceAt || policy.lecture2.quarterAfter >= policy.lecture2.absenceAt) { showToast('حدود الوقت غير متسلسلة', 'error'); return; }
  const history = [...(AppData.settings.attendancePolicyHistory || [])];
  if (AppData.settings.attendancePolicy) history.push({ ...AppData.settings.attendancePolicy, archivedAt: new Date().toISOString() });
  const settings = { ...AppData.settings, attendancePolicy: policy, attendancePolicyHistory: history };
  try {
    await DB.setSettings(settings);
    AppData.settings = settings;
    await DB.addLog({ action: 'اعتماد سياسة حضور', details: `نسخة ${policy.version}`, policyVersion: policy.version });
    showToast('✅ تم اعتماد سياسة الحضور وحفظ نسختها السابقة');
    renderApp();
  } catch (e) { console.error(e); showToast('فشل حفظ السياسة', 'error'); }
}

function viewAttendancePolicyHistory() {
  const history = AppData.settings.attendancePolicyHistory || [];
  const current = AppData.settings.attendancePolicy;
  const rows = [...history, ...(current ? [current] : [])].reverse().map((policy, index) => `
    <tr><td>${index + 1}</td><td>${policy.version || '—'}</td><td>${Helpers.escapeHtml(policy.effectiveFrom || policy.archivedAt || '—')}</td><td>${policy.eligibilityPercent}%</td><td>${policy.warningInterrupted}/${policy.warningConsecutive}</td></tr>
  `).join('');
  showModal('نسخ سياسات الحضور المعتمدة', `<div class="table-wrap"><table><thead><tr><th>#</th><th>النسخة</th><th>تاريخ السريان/الأرشفة</th><th>الأهلية</th><th>متقطع/متتالي</th></tr></thead><tbody>${rows || '<tr><td colspan="5">لا توجد نسخ سابقة</td></tr>'}</tbody></table></div>`);
}

function backupFullData() {
  const data = {
    version: '9.0', timestamp: new Date().toISOString(),
    students: AppData.students, servants: AppData.servants,
    attendance: AppData.attendance, evaluations: AppData.evaluations,
    exams: AppData.exams, visitationNotes: AppData.visitationNotes,
    settings: AppData.settings
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ تم إنشاء النسخة الاحتياطية');
}

function restoreFullData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('⚠️ سيتم استبدال جميع البيانات الحالية. متابعة؟')) return;
      showLoading('جارٍ الاستعادة...');
      if (data.students) { await DB.deleteAllStudents(); for (const s of data.students) await DB.addStudent(s); }
      if (data.servants) { await DB.deleteAllServants(); for (const s of data.servants) await DB.addServant(s); }
      if (data.attendance) { await DB.deleteAllAttendance(); if (data.attendance.length > 0) await DB.saveAttendanceBulk(data.attendance); }
      if (data.evaluations) { await DB.deleteAllEvaluations(); if (data.evaluations.length > 0) await DB.saveEvaluationsBulk(data.evaluations); }
      if (data.exams) { await DB.deleteAllExams(); if (data.exams.length > 0) await DB.saveExamsBulk(data.exams); }
      if (data.settings) await DB.setSettings(data.settings);
      showToast('✅ تمت الاستعادة');
      setTimeout(() => location.reload(), 1500);
    } catch (err) { showToast('❌ فشل: ' + err.message, 'error'); }
    finally { hideLoading(); }
  };
  reader.readAsText(file);
}

async function executeSystemReset() {
  const confirmText = document.getElementById('confirmDelete').value.trim();
  if (confirmText !== 'تأكيد الحذف') { showToast('⚠️ اكتب "تأكيد الحذف"', 'error'); return; }
  const delStudents = document.getElementById('del_students').checked;
  const delServants = document.getElementById('del_servants').checked;
  const delAttendance = document.getElementById('del_attendance').checked;
  const delEvaluations = document.getElementById('del_evaluations').checked;
  const delExams = document.getElementById('del_exams').checked;
  const delNotes = document.getElementById('del_notes').checked;
  const delLogs = document.getElementById('del_logs').checked;
  if (!delStudents && !delServants && !delAttendance && !delEvaluations && !delExams && !delNotes && !delLogs) { showToast('⚠️ اختر عنصر', 'warning'); return; }
  const items = [];
  if (delStudents) items.push('الدارسين');
  if (delServants) items.push('الخدام');
  if (delAttendance) items.push('الحضور');
  if (delEvaluations) items.push('أعمال السنة');
  if (delExams) items.push('الامتحانات');
  if (delNotes) items.push('النوتة الروحية');
  if (delLogs) items.push('السجل');
  if (!confirm(`⚠️ سيتم حذف: ${items.join(' • ')}\n\nلا يمكن التراجع!`)) return;
  try {
    showLoading('جارٍ الحذف...');
    if (delStudents) { await DB.deleteAllStudents(); AppData.students = []; }
    if (delServants) { await DB.deleteAllServants(); AppData.servants = []; }
    if (delAttendance) { await DB.deleteAllAttendance(); AppData.attendance = []; }
    if (delEvaluations) { await DB.deleteAllEvaluations(); AppData.evaluations = []; }
    if (delExams) { await DB.deleteAllExams(); AppData.exams = []; }
    if (delNotes) { await DB.deleteAllVisitationNotes(); AppData.visitationNotes = []; }
    if (delLogs) { await DB.deleteAllLogs(); AppData.logs = []; }
    showToast(`✅ تم حذف: ${items.join(' • ')}`);
    renderApp();
  } catch (e) { showToast('❌ فشل: ' + e.message, 'error'); }
  finally { hideLoading(); }
}

/* ============================================================
   EXPORT FUNCTIONS
   ============================================================ */
function exportStudentsExcel() {
  const rows = AppData.students.map(s => ({
    'الكود': s.id, 'الاسم': s.name, 'النوع': s.gender, 'الميلاد': s.birthdate,
    'الكتاب': s.stage, 'الدفعة': s.classGroup, 'الرتبة': s.deaconRank || '',
    'هاتف 1': s.phone1, 'هاتف 2': s.phone2 || '', 'العنوان': s.address || '',
    'الاستمارة': s.formReceived ? 'نعم' : 'لا', 'الدفع': s.formPaid ? 'نعم' : 'لا',
    'أضيف بواسطة': Helpers.getStudentAdder(s)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الدارسين');
  XLSX.writeFile(wb, `students_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportServantsExcel() {
  const rows = AppData.servants.map(s => ({
    'الكود': s.code, 'الاسم': s.name, 'الهاتف': s.phone,
    'الفصول': Helpers.getServantClassGroups(s).join(' • '),
    'المواد': Helpers.getServantSubjects(s).map(x => Helpers.getSubjectLabel(x)).join(' • '),
    'الأدوار': Helpers.getServantAdminRoles(s).map(r => Helpers.getServantAdminRoleLabel(r)).join(' • ')
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الخدام');
  XLSX.writeFile(wb, `servants_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportAllGradesExcel() {
  const tw = AppData.settings.totalWeeks || 15;
  const te = AppData.settings.totalEvaluations || 10;
  const subjects = Helpers.getSubjects();
  const rows = AppData.students.map(s => {
    const row = { 'الكود': s.id, 'الاسم': s.name, 'الدفعة': s.classGroup };
    let totalAll = 0;
    subjects.forEach(sub => {
      const g = GRADING_SYSTEM.calculateSubjectGrade(s.id, sub.value, tw, te);
      row[`${sub.label} - حضور`] = g.attendanceScore;
      row[`${sub.label} - تقييم`] = g.evalScore;
      row[`${sub.label} - امتحان`] = g.examScore;
      row[`${sub.label} - المجموع`] = g.total;
      totalAll += g.total;
    });
    row['المجموع الكلي'] = totalAll.toFixed(1);
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الدرجات');
  XLSX.writeFile(wb, `grades_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportAttendanceExcel() {
  const tw = AppData.settings.totalWeeks || 15;
  const rows = AppData.students.map(s => {
    const row = { 'الكود': s.id, 'الاسم': s.name, 'الدفعة': s.classGroup };
    const att = AppData.attendance.filter(a => a.studentId === s.id && a.type !== 'visitation');
    for (let w = 1; w <= tw; w++) {
      const r = att.find(a => a.week === w);
      row[`أ${w}`] = !r ? '' : (r.status === 'present' ? 'حاضر' : 'غائب');
    }
    row['الحضور'] = att.filter(a => a.status === 'present').length;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الحضور');
  XLSX.writeFile(wb, `attendance_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportEvaluationsExcel() {
  const rows = AppData.evaluations.map(e => {
    const st = AppData.students.find(s => s.id === e.studentId);
    return { 'الدارس': st ? st.name : e.studentId, 'الدفعة': st?.classGroup || '', 'المادة': Helpers.getSubjectLabel(e.subject), 'الأسبوع': e.week, 'الدرجة': e.score };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'أعمال السنة');
  XLSX.writeFile(wb, `evaluations_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportExamsExcel() {
  const rows = AppData.exams.map(e => {
    const st = AppData.students.find(s => s.id === e.studentId);
    return { 'الدارس': st ? st.name : e.studentId, 'الدفعة': st?.classGroup || '', 'المادة': Helpers.getSubjectLabel(e.subject), 'الدرجة': e.score };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الامتحانات');
  XLSX.writeFile(wb, `exams_${Date.now()}.xlsx`);
  showToast('✅ تم التصدير');
}
function exportPDF() {
  showToast('جاري إنشاء PDF...', 'info');
  setTimeout(() => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('نظام خدمة إعداد الخدام - تقرير', 105, 20, { align: 'center' });
    let y = 40;
    AppData.students.slice(0, 40).forEach((s, i) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`${i + 1}. ${s.id} - ${s.name} - ${s.classGroup}`, 10, y);
      y += 7;
    });
    doc.save('report.pdf');
    showToast('✅ تم');
  }, 500);
}

/* ============================================================
   PRINT FUNCTIONS
   ============================================================ */
const SYSTEM_REPORT_TITLES = {
  general: 'التقرير العام للطلاب والدفعات والكتب',
  studentFile: 'تقرير ملف الطالب والسجل الأكاديمي',
  attendance: 'تقرير الحضور والغياب',
  eligibility: 'تقرير أهلية الامتحانات',
  dailyNote: 'تقرير النوتة الروحية اليومية',
  monthlyNote: 'تقرير النوتة الشهرية لكل طالب',
  termNote: 'تقرير النوتة الفصلية والنسب الإجمالية',
  sacraments: 'تقرير الاعتراف والتناول',
  mass: 'تقرير حضور القداس والتسبحة',
  assignments: 'تقرير الواجبات والأبحاث وحالة التسليم',
  servicePreparation: 'تقرير تقييم وتحضير دروس الخدمة',
  coursework: 'تقرير أعمال السنة',
  biblicalCompetition: 'تقرير مسابقات الكتاب المقدس',
  curriculumCompetition: 'تقرير مسابقات كتاب المنهج',
  coptic: 'تقرير اللغة القبطية',
  morningPrayer: 'تقرير تسميع صلاة باكر',
  exams: 'تقرير الامتحانات والنتائج',
  failedRetried: 'تقرير الراسبين والمعيدين',
  transfers: 'تقرير انتقالات الطلاب بين الدفعات والكتب',
  servants: 'تقرير الخدام والتكليفات والتقييمات',
  decisions: 'تقرير القرارات والاستثناءات',
  gradeChanges: 'تقرير تعديل الدرجات والصلاحيات والاعتمادات',
  imports: 'تقرير عمليات الاستيراد من Excel',
  sync: 'تقرير الأعطال والمزامنة والتغييرات'
};

function printSystemReport(reportType) {
  if (reportType === 'attendance') return printAttendanceReport('all');
  if (reportType === 'coursework') return printClassGradesReport('all', 'all');
  if (reportType === 'monthlyNote') return printMonthlySpiritualNoteReport();
  if (reportType === 'dailyNote' || reportType === 'termNote') {
    const records = AppData.visitationNotes.filter(n => n.type === 'spiritualDaily');
    const rows = records.sort((a, b) => String(b.noteDate || '').localeCompare(String(a.noteDate || ''))).map((record, index) => {
      const student = AppData.students.find(s => String(s.id) === String(record.studentId));
      const items = record.items || {};
      return `<tr><td>${index + 1}</td><td>${Helpers.escapeHtml(student?.name || record.studentName || '—')}</td><td>${Helpers.escapeHtml(record.noteDate || '—')}</td><td>${items.gospel ? '✓' : '—'}</td><td>${items.morningPrayer ? '✓' : '—'}</td><td>${items.eveningPrayer ? '✓' : '—'}</td><td>${items.nightPrayer ? '✓' : '—'}</td><td>${items.confession ? '✓' : '—'}</td><td>${items.communion ? '✓' : '—'}</td><td>${Helpers.escapeHtml(record.reviewStatus === 'approved' ? 'معتمد' : 'قيد الاعتماد')}</td></tr>`;
    }).join('');
    const body = records.length ? rows : `<tr><td colspan="10" style="text-align:center;padding:24px;color:#777">لا توجد بيانات نوتة مسجلة حتى الآن</td></tr>`;
    return openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>${SYSTEM_REPORT_TITLES[reportType]}</p></div><table style="font-size:0.75rem"><thead><tr><th>#</th><th>الاسم</th><th>التاريخ</th><th>الإنجيل</th><th>باكر</th><th>غروب</th><th>نوم</th><th>اعتراف</th><th>تناول</th><th>الحالة</th></tr></thead><tbody>${body}</tbody></table></div>`, SYSTEM_REPORT_TITLES[reportType]);
  }
  if (reportType === 'general') return printClassList('all');
  if (reportType === 'studentFile') {
    const students = [...AppData.students].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    if (!students.length) return showToast('لا توجد بيانات طلاب للطباعة', 'error');
    const rows = students.map((student, index) => `<tr><td>${index + 1}</td><td>${Helpers.escapeHtml(student.name || '')}</td><td><code>${Helpers.escapeHtml(student.id || '')}</code></td><td>${Helpers.escapeHtml(student.batchYear || student.batch || '—')}</td><td>${Helpers.escapeHtml(student.studyBook || student.classGroup || '—')}</td><td>${Helpers.escapeHtml(student.status || 'نشط')}</td></tr>`).join('');
    return openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>${SYSTEM_REPORT_TITLES.studentFile}</p></div><table><thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الدفعة</th><th>الكتاب</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table><div class="print-footer">تم الطباعة بواسطة: ${Helpers.escapeHtml(State.currentUser?.data?.name || '—')}</div></div>`, SYSTEM_REPORT_TITLES.studentFile);
  }

  const sourceMap = {
    exams: [AppData.exams || [], ['الدارس', 'النتيجة', 'الحالة']],
    eligibility: [AppData.attendance || [], ['الدارس', 'الأسبوع', 'الحالة']],
    sacraments: [AppData.visitationNotes.filter(n => n.type === 'spiritualDaily'), ['الدارس', 'التاريخ', 'الاعتراف', 'التناول']],
    mass: [AppData.attendance.filter(a => ['mass', 'vespers'].includes(a.category || a.type)), ['الدارس', 'التاريخ', 'النوع', 'الحالة']],
    assignments: [AppData.evaluations || [], ['الدارس', 'المادة', 'التقييم']],
    servicePreparation: [AppData.evaluations || [], ['الدارس', 'المادة', 'التقييم']],
    failedRetried: [AppData.exams || [], ['الدارس', 'الكتاب', 'النتيجة', 'الحالة']],
    transfers: [AppData.logs || [], ['التاريخ', 'الطالب', 'تفاصيل النقل']],
    servants: [AppData.servants || [], ['الاسم', 'الصلاحية', 'المجموعات']],
    decisions: [AppData.logs || [], ['التاريخ', 'الطالب', 'القرار']],
    gradeChanges: [AppData.logs || [], ['التاريخ', 'المستخدم', 'التعديل']],
    imports: [AppData.logs.filter(l => String(l.action || '').includes('استيراد')), ['التاريخ', 'المستخدم', 'تفاصيل الاستيراد']],
    sync: [AppData.logs.filter(l => /مزامن|sync|خطأ|offline/i.test(`${l.action || ''} ${l.details || ''}`)), ['التاريخ', 'الحالة', 'التفاصيل']]
  };
  const entry = sourceMap[reportType];
  const records = entry ? entry[0] : [];
  const headers = entry ? entry[1] : ['البيان', 'الحالة'];
  let rows = records.map((record, index) => {
    const student = AppData.students.find(s => String(s.id) === String(record.studentId));
    const values = reportRecordValues(reportType, record, student);
    return `<tr><td>${index + 1}</td>${values.map(value => `<td>${Helpers.escapeHtml(String(value ?? '—'))}</td>`).join('')}</tr>`;
  }).join('');
  if (!records.length) {
    rows = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:24px;color:#777">لا توجد بيانات مسجلة لهذا التقرير حتى الآن</td></tr>`;
  }
  openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>${SYSTEM_REPORT_TITLES[reportType]}</p></div><table><thead><tr><th>#</th>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="print-footer">تم الطباعة بواسطة: ${Helpers.escapeHtml(State.currentUser?.data?.name || '—')} • ${new Date().toLocaleString('ar-EG')}</div></div>`, SYSTEM_REPORT_TITLES[reportType]);
}

function reportRecordValues(type, record, student) {
  const name = student?.name || record.studentName || record.name || '—';
  if (type === 'exams') return [name, record.score ?? record.result ?? record.grade ?? '—', record.status || 'مسجل'];
  if (type === 'eligibility') return [name, record.week ?? '—', record.status || '—'];
  if (type === 'sacraments') return [name, record.noteDate || '—', record.items?.confession ? 'نعم' : 'لا', record.items?.communion ? 'نعم' : 'لا'];
  if (type === 'mass') return [name, record.date || record.noteDate || '—', record.category || record.type || '—', record.status || '—'];
  if (type === 'assignments' || type === 'servicePreparation') return [name, record.subject || record.subjectName || '—', record.score ?? record.value ?? '—'];
  if (type === 'failedRetried') return [name, record.studyBook || record.book || '—', record.score ?? record.result ?? '—', record.status || record.result || '—'];
  if (type === 'servants') return [record.name || name, record.role || record.permissions || '—', Array.isArray(record.classGroups) ? record.classGroups.join('، ') : '—'];
  return [record.createdAt || record.date || record.timestamp || '—', record.userName || record.studentName || record.name || name, record.details || record.description || record.action || record.decision || '—'];
}

function printAllReports() {
  const studentsCount = AppData.students.length;
  const rows = Object.entries(SYSTEM_REPORT_TITLES).map(([type, title], index) => `<tr><td>${index + 1}</td><td>${Helpers.escapeHtml(title)}</td><td>${type === 'general' ? studentsCount : 'متاح للطباعة'}</td></tr>`).join('');
  openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>الكشاف العام للتقارير المعتمدة</p></div><table><thead><tr><th>#</th><th>التقرير</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'الكشاف العام للتقارير');
}

function printClassList(classGroup) {
  const students = AppData.students.filter(s => classGroup === 'all' || classGroup === 'الكل' || s.classGroup === classGroup).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (students.length === 0) { showToast('لا يوجد دارسين', 'error'); return; }
  const rows = students.map((s, i) => `
    <tr><td>${i + 1}</td><td>${s.name}</td><td>${s.id}</td>
    <td>${s.gender}</td><td>${s.stage}</td><td>${s.classGroup}</td>
    <td>${s.phone1 || ''}</td><td>${s.deaconRank || 'غير مطلوب'}</td><td>${Helpers.getStudentAdder(s)}</td></tr>
  `).join('');
  const title = classGroup === 'all' || classGroup === 'الكل' ? 'كل الفصول' : classGroup;
  openPrintWindow(`
    <div class="print-area">
      <div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>قائمة دارسي ${title}</p></div>
      <div class="print-meta">
        <span><strong>إجمالي:</strong> ${students.length}</span>
        <span><strong>ذكور:</strong> ${students.filter(s => s.gender === 'ذكر').length}</span>
        <span><strong>إناث:</strong> ${students.filter(s => s.gender === 'أنثى').length}</span>
      </div>
      <table><thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>النوع</th><th>الكتاب</th><th>الدفعة</th><th>الهاتف</th><th>الرتبة</th><th>أضيف بواسطة</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="print-footer">تم الطباعة بواسطة: ${State.currentUser?.data?.name || '—'} • ${new Date().toLocaleString('ar-EG')}</div>
    </div>
  `, `قائمة_${title}`);
}

function printAttendanceReport(classGroup) {
  const students = AppData.students.filter(s => classGroup === 'all' || classGroup === 'الكل' || s.classGroup === classGroup).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (students.length === 0) { showToast('لا يوجد دارسين', 'error'); return; }
  const tw = AppData.settings.totalWeeks || 15;
  const weeks = Array.from({length: tw}, (_, i) => i + 1);
  const headerCols = weeks.map(w => {
    const wd = Helpers.getWeekWithDate(w);
    return `<th style="font-size:0.65rem;padding:4px 2px;"><div><span style="font-weight:700;">أ${w}</span><br><span style="opacity:0.7;font-size:0.55rem;">${wd.dateShort}</span></div></th>`;
  }).join('');
  const rows = students.map((s, i) => {
    const att = AppData.attendance.filter(a => a.studentId === s.id && a.type !== 'visitation');
    const cells = weeks.map(w => {
      const r = att.find(a => a.week === w);
      if (!r) return '<td style="text-align:center;color:#ccc;">—</td>';
      return r.status === 'present' ? '<td style="text-align:center;color:#2e7d32;font-weight:bold;">✓</td>' : '<td style="text-align:center;color:#c62828;font-weight:bold;">✗</td>';
    }).join('');
    const present = att.filter(a => a.status === 'present').length;
    const pct = Math.round((present / tw) * 100);
    return `<tr><td>${i + 1}</td><td>${s.name}</td>${cells}<td>${present}/${tw}</td><td>${pct}%</td></tr>`;
  }).join('');
  const title = classGroup === 'all' || classGroup === 'الكل' ? 'كل الفصول' : classGroup;
  openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ كشف الحضور - ${title} ☩</h1></div><table style="font-size:0.7rem;"><thead><tr><th>#</th><th>الاسم</th>${headerCols}<th>الحضور</th><th>%</th></tr></thead><tbody>${rows}</tbody></table><div class="print-footer">تم الطباعة بواسطة: ${State.currentUser?.data?.name || '—'}</div></div>`, `حضور_${title}`);
}

function printClassGradesReport(classGroup, subjectFilter = 'all') {
  const students = AppData.students.filter(s => classGroup === 'all' || classGroup === 'الكل' || s.classGroup === classGroup).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (students.length === 0) { showToast('لا يوجد دارسين', 'error'); return; }
  const tw = AppData.settings.totalWeeks || 15;
  const te = AppData.settings.totalEvaluations || 10;
  const subjects = Helpers.getSubjects();
  const rows = students.map((s, i) => {
    const grades = subjects.map(sub => GRADING_SYSTEM.calculateSubjectGrade(s.id, sub.value, tw, te));
    const countedGrades = grades.filter((grade, index) => subjects[index]?.countInTotal !== false);
    const totalAll = countedGrades.reduce((sum, g) => sum + g.total, 0);
    const avg = countedGrades.length > 0 ? totalAll / countedGrades.length : 0;
    const letter = GRADING_SYSTEM.getGradeLetter(avg);
    return `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.classGroup}</td>${grades.map(g => `<td>${g.total}</td>`).join('')}<td><strong>${totalAll.toFixed(1)}</strong></td><td><strong>${avg.toFixed(1)}</strong></td><td style="color:${letter.color};font-weight:700;">${letter.label}</td></tr>`;
  }).join('');
  const title = classGroup === 'all' || classGroup === 'الكل' ? 'كل الفصول' : classGroup;
  openPrintWindow(`<div class="print-area"><div class="print-header"><h1>☩ كشف أعمال السنة - ${title} ☩</h1><p style="font-size:0.8rem;">المواد العادية: 20+30+50 | الألحان: 20+20+60</p></div><table style="font-size:0.7rem;"><thead><tr><th>#</th><th>الاسم</th><th>الدفعة</th>${subjects.map(s => `<th>${s.icon} ${s.label}</th>`).join('')}<th>المجموع</th><th>المتوسط</th><th>التقدير</th></tr></thead><tbody>${rows}</tbody></table><div class="print-footer">تم الطباعة بواسطة: ${State.currentUser?.data?.name || '—'}</div></div>`, `تقييمات_${title}`);
}

function printAllVisitationReports() {
  printMonthlySpiritualNoteReport();
}

function printClassNotesReport(classGroup) {
  printMonthlySpiritualNoteReport(classGroup);
}

function printMonthlySpiritualNoteReport(batchFilter = 'all') {
  const month = State.activeTab['notes_month'] || new Date().toISOString().slice(0, 7);
  const itemLabels = {
    gospel: 'قراءة الإنجيل', morningPrayer: 'صلاة باكر', eveningPrayer: 'صلاة الغروب',
    nightPrayer: 'صلاة النوم', communion: 'التناول', confession: 'الاعتراف'
  };
  const students = AppData.students.filter(s => batchFilter === 'all' || String(s.batchYear || s.classGroup) === String(batchFilter));
  if (!students.length) { showToast('لا يوجد دارسون لهذه الدفعة', 'error'); return; }
  const rows = students.map((student, index) => {
    const records = AppData.visitationNotes.filter(n =>
      n.type === 'spiritualDaily' && String(n.studentId) === String(student.id) && String(n.noteDate || '').startsWith(month)
    );
    const recordedDays = [...new Set(records.map(n => n.noteDate))].length;
    const cells = Object.keys(itemLabels).map(key => {
      const done = records.filter(n => n.items?.[key] === true).length;
      const percent = recordedDays ? Math.round(done / recordedDays * 100) : 0;
      return `<td><strong>${percent}%</strong><br><small>${done}/${recordedDays}</small></td>`;
    }).join('');
    const approved = records.length > 0 && records.every(n => n.reviewStatus === 'approved');
    return `<tr><td>${index + 1}</td><td>${Helpers.escapeHtml(student.name)}<br><code>${Helpers.escapeHtml(student.id)}</code></td><td>${recordedDays}</td>${cells}<td>${approved ? 'معتمد' : 'قيد الاعتماد'}</td></tr>`;
  }).join('');
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  const batchLabel = batchFilter === 'all' ? 'جميع الدفعات' : `دفعة ${batchFilter}`;
  openPrintWindow(`
    <div class="print-area">
      <div class="print-header"><h1>☩ كشف النوتة الروحية الشهري ☩</h1><p>${AppData.settings.centerName}</p><p>${monthLabel} - ${batchLabel}</p></div>
      <table style="font-size:0.72rem;"><thead><tr><th>#</th><th>الاسم والرمز</th><th>أيام مسجلة</th>${Object.values(itemLabels).map(label => `<th>${label}</th>`).join('')}<th>اعتماد الشهر</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="print-footer">النسب محسوبة آليًا من السجلات اليومية. تم الطباعة بواسطة: ${Helpers.escapeHtml(State.currentUser?.data?.name || '—')}</div>
    </div>
  `, `نوتة_شهرية_${month}_${batchFilter}`);
}

function printStudentCard(studentId) {
  const s = AppData.students.find(x => x.id === studentId);
  if (!s) return;
  openPrintWindow(`
    <div class="print-area">
      <div class="print-header"><h1>☩ ${AppData.settings.centerName} ☩</h1><p>${AppData.settings.slogan || ''}</p></div>
      <div style="text-align:center;padding:20px;border:3px double #0B1F3A;border-radius:12px;max-width:450px;margin:20px auto;">
        <div style="font-size:30px;color:#C9A227;">☩</div>
        <h3 style="color:#0B1F3A;margin:10px 0;">${s.name}</h3>
        <code style="background:#f0f0f0;padding:4px 10px;border-radius:6px;font-weight:bold;">${s.id}</code>
        <div style="margin-top:14px;text-align:right;font-size:13px;">
          <p><strong>الكتاب:</strong> ${s.stage}</p>
          <p><strong>الدفعة:</strong> ${s.classGroup}</p>
          <p><strong>النوع:</strong> ${s.gender}</p>
          <p><strong>الهاتف:</strong> ${s.phone1 || '—'}</p>
          <p><strong>الرتبة:</strong> ${s.deaconRank || '—'}</p>
          <p><strong>الكنيسة:</strong> ${s.church || '—'}</p>
          <p><strong>أضيف بواسطة:</strong> ${Helpers.getStudentAdder(s)}</p>
        </div>
      </div>
    </div>
  `, `بطاقة_${s.name}`);
}

function openPrintWindow(html, title) {
  const win = window.open('', '_blank');
  if (!win) { showToast('❌ يرجى السماح بالنوافذ', 'error'); return; }
  const styles = document.querySelector('style').innerHTML;
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${title}</title><style>${styles} body{background:white;} .print-area{display:block!important;position:relative!important;}</style></head><body>${html}<script>window.onload=function(){setTimeout(()=>window.print(),400);}<\/script></body></html>`);
  win.document.close();
}

/* ============================================================
   SIDEBAR & MAIN RENDER
   ============================================================ */
function buildSidebar() {
  const nav = document.getElementById('sideNav');
  const sidebar = document.getElementById('sidebar');
  const user = State.currentUser;
  if (!user) { sidebar.classList.add('hidden'); return; }
  sidebar.classList.remove('hidden');
  let html = '';
  if (user.type === 'student') {
    html = `<div class="nav-section"><div class="nav-title">القائمة</div><div class="nav-item active" data-page="dashboard"><span class="icon">👤</span> ملفي</div></div>`;
  } else if (user.type === 'servant') {
    const s = user.data;
    html = `
      <div class="nav-section"><div class="nav-title">الرئيسية</div>
      <div class="nav-item active" data-page="dashboard"><span class="icon">📊</span> لوحة التحكم</div></div>
      <div class="nav-section"><div class="nav-title">التعليم</div>
        ${Helpers.canEditStudents(s) ? '<div class="nav-item" data-page="dashboard" data-tab="manage_students"><span class="icon">👨‍🎓</span> إدارة الدارسين</div>' : ''}
        ${Helpers.canEditAttendance(s) ? '<div class="nav-item" data-page="dashboard" data-tab="attendance"><span class="icon">📋</span> الحضور</div>' : ''}
        ${Helpers.canViewAllGrades(s) ? '<div class="nav-item" data-page="dashboard" data-tab="quick_eval"><span class="icon">⚡</span> أعمال السنة</div>' : ''}
        ${Helpers.canViewAllGrades(s) ? '<div class="nav-item" data-page="dashboard" data-tab="exams"><span class="icon">🎓</span> الامتحانات</div>' : ''}
        ${Helpers.canAddVisitationNotes(s) ? '<div class="nav-item" data-page="dashboard" data-tab="visitation"><span class="icon">🙏</span> النوتة الروحية</div>' : ''}
      </div>`;
  } else if (user.type === 'admin') {
    html = `
      <div class="nav-section"><div class="nav-title">الرئيسية</div>
      <div class="nav-item active" data-page="dashboard" data-tab="students"><span class="icon">📊</span> لوحة التحكم</div></div>
      <div class="nav-section"><div class="nav-title">الإدارة</div>
        <div class="nav-item" data-page="dashboard" data-tab="students"><span class="icon">👨‍🎓</span> الدارسين النشطين</div>
        <div class="nav-item" data-page="dashboard" data-tab="graduates"><span class="icon">🎓</span> خريجي إعداد الخدام</div>
        <div class="nav-item" data-page="dashboard" data-tab="servants"><span class="icon">👨‍🏫</span> الخدام</div>
        <div class="nav-item" data-page="dashboard" data-tab="attendance"><span class="icon">📋</span> الحضور</div>
        <div class="nav-item" data-page="dashboard" data-tab="evaluation"><span class="icon">⚡</span> التقييم</div>
        <div class="nav-item" data-page="dashboard" data-tab="exams"><span class="icon">🎓</span> الامتحانات</div>
        <div class="nav-item" data-page="dashboard" data-tab="notes"><span class="icon">📔</span> النوتة الروحية</div>
      </div>
      <div class="nav-section"><div class="nav-title">المراقبة</div>
        <div class="nav-item" data-page="dashboard" data-tab="sessions"><span class="icon">👁️</span> المتصلون الآن</div>
      </div>
      <div class="nav-section"><div class="nav-title">النظام</div>
        <div class="nav-item" data-page="dashboard" data-tab="reports"><span class="icon">🖨️</span> التقارير</div>
        <div class="nav-item" data-page="dashboard" data-tab="system"><span class="icon">⚙️</span> إدارة النظام</div>
      </div>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => {
      if (el.dataset.tab) State.activeTab['dashboard'] = el.dataset.tab;
      State.setPage(el.dataset.page);
      if (window.innerWidth <= 1024) document.getElementById('sidebar').classList.remove('open');
    };
  });
}

function renderApp() {
  const app = document.getElementById('appContainer');
  const navLogin = document.getElementById('navLoginBtn');
  const navDash = document.getElementById('navDashBtn');
  const navLogout = document.getElementById('navLogoutBtn');
  const user = State.currentUser;
  if (user) {
    navLogin.classList.add('hidden'); navDash.classList.remove('hidden'); navLogout.classList.remove('hidden');
    navDash.textContent = user.type === 'student' ? '👨‍🎓 لوحتي' : user.type === 'servant' ? '👨‍🏫 لوحة الخادم' : '👨‍💼 لوحة التحكم';
  } else {
    navLogin.classList.remove('hidden'); navDash.classList.add('hidden'); navLogout.classList.add('hidden');
  }
  buildSidebar();
  document.querySelectorAll('#mainNav button[data-page]').forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`#mainNav button[data-page="${State.currentPage}"]`);
  if (active) active.classList.add('active');
  switch (State.currentPage) {
    case 'home': app.innerHTML = renderHome(); document.getElementById('sidebar').classList.add('hidden'); break;
    case 'login':
      app.innerHTML = renderLogin();
      document.getElementById('sidebar').classList.add('hidden');
      document.querySelectorAll('#loginTabs button').forEach(btn => btn.addEventListener('click', function() { switchLoginTab(this.dataset.role); }));
      break;
    case 'dashboard':
      if (!user) { State.setPage('login'); return; }
      if (user.type === 'student') {
        app.innerHTML = renderStudentDashboard();
        document.querySelectorAll('#studentTabs button').forEach(btn => btn.addEventListener('click', function() { State.setTab(this.dataset.tab); }));
      } else if (user.type === 'servant') {
        app.innerHTML = renderServantDashboard();
        document.querySelectorAll('#servantTabs button').forEach(btn => btn.addEventListener('click', function() { State.setTab(this.dataset.tab); }));
      } else if (user.type === 'admin') {
        app.innerHTML = renderAdminDashboard();
        document.querySelectorAll('#adminTabs button').forEach(btn => btn.addEventListener('click', function() { State.setTab(this.dataset.tab); }));
      }
      break;
    default: app.innerHTML = renderHome();
  }
  document.querySelectorAll('#mainNav button[data-page]').forEach(btn => {
    btn.addEventListener('click', function() { State.setPage(this.dataset.page); });
  });
}

/* ============================================================
   PWA - Service Worker Registration
   ============================================================ */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    if (deferredPrompt && !localStorage.getItem('pwa_dismissed')) {
      document.getElementById('pwaBanner').classList.add('show');
    }
  }, 5000);
});

function installPWA() {
  if (!deferredPrompt) { showToast('⚠️ التطبيق مثبت بالفعل', 'warning'); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') showToast('✅ تم تثبيت التطبيق');
    deferredPrompt = null;
    document.getElementById('pwaBanner').classList.remove('show');
  });
}
function dismissPWA() {
  document.getElementById('pwaBanner').classList.remove('show');
  localStorage.setItem('pwa_dismissed', 'true');
}
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      console.log('✅ Service Worker registered:', registration.scope);
    } catch (e) { console.warn('❌ Service Worker registration failed:', e); }
  }
}

/* ============================================================
   Init
   ============================================================ */
async function init() {
  ConnectionState.init();
  await AuthManager.init();
  await registerServiceWorker();
  
  const session = DB.getSession();
  if (session) {
    State.currentUser = session;
    const savedSessionId = localStorage.getItem('habib_session_id');
    if (savedSessionId) {
      SessionTracker.currentSessionId = savedSessionId;
      SessionTracker.deviceFingerprint = getDeviceFingerprint();
      SessionTracker.startHeartbeat();
    } else {
      await SessionTracker.startSession(session);
    }
  }
  
  document.getElementById('navLogoutBtn').addEventListener('click', () => State.logout());
  document.getElementById('modalOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  
  window.addEventListener('beforeunload', () => { SessionTracker.endSession(); });
  
  await AppData.loadAll();
  
  if (State.currentUser?.type === 'admin') {
    SessionTracker.startMonitoring((sessions) => {
      AppData.activeSessions = sessions;
      if (State.currentPage === 'dashboard' && State.getTab() === 'sessions') renderApp();
    });
  }
  
  setInterval(() => {
    if (State.currentUser?.type === 'admin' && State.currentPage === 'dashboard' && State.getTab() === 'sessions') {
      renderApp();
    }
  }, 30000);
  
  renderApp();
  showToast('✅ تم الاتصال');
}
document.addEventListener('DOMContentLoaded', init);

/* ============================================================
   Global Exports
   ============================================================ */
Object.assign(window, {
  State, AppData, Helpers, GRADING_SYSTEM, SessionTracker, renderApp,
  handleLogin, switchLoginTab, closeModal, showToast, toggleSidebar,
  saveAttendanceBulk, markAllPresent, markAllAbsent, changeWeek,
  saveQuickEvaluations, saveExamsBulk,
  changeServantPassword, changeAdminPassword,
  openAddStudentModal, saveNewStudent, regenerateStudentCode, copyToClipboard,
  openEditStudentModal, updateStudentData, deleteStudentConfirm, openStudentFile, filterStudentsTable, updateDeaconOptions,
  openAddServantModal, saveNewServant, toggleAllClassesBtn, toggleClassBtn,
  openEditServantModal, updateServantData, deleteServantConfirm,
  toggleEditAllClassesBtn, toggleEditClassBtn,
  openNotesModal, saveNote, filterNotesStudents, openSpiritualNoteModal, reloadSpiritualNote, saveSpiritualNote, openSpiritualNoteRules,
  openStudentSpiritualNoteModal, approveSpiritualNote,
  saveSettings, addCurriculumSubject, saveAttendancePolicy, viewAttendancePolicyHistory, AttendanceEngine,
  backupFullData, restoreFullData, executeSystemReset,
  exportStudentsExcel, exportServantsExcel, exportAllGradesExcel,
  exportAttendanceExcel, exportEvaluationsExcel, exportExamsExcel, exportPDF,
  printClassList, printAttendanceReport, printClassGradesReport,
  printClassNotesReport, printAllVisitationReports, printStudentCard,
  printMonthlySpiritualNoteReport, approveMonthlySpiritualNotes, canApproveMonthlyNotes,
  printSystemReport, printAllReports,
  selectReportClass,
  forceLogoutUser, cleanupSessions,
  installPWA, dismissPWA
});
