/**
 * Building Bills Management System
 * برنامه مدیریت مصارف برق و آب ساختمان
 */

// ============================
// DATA MANAGEMENT
// ============================

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCnE92P9Yxi5FL01aJae9Ky83lsZ76LBLI",
    authDomain: "abdali-34515.firebaseapp.com",
    databaseURL: "https://abdali-34515-default-rtdb.firebaseio.com",
    projectId: "abdali-34515",
    storageBucket: "abdali-34515.firebasestorage.app",
    messagingSenderId: "944530492505",
    appId: "1:944530492505:web:65be948eb0aed249193548",
    measurementId: "G-HQVR6ESGBK"
};

// Initialize Firebase
let firebaseApp = null;
let dbRef = null;
let firebaseError = null;
try {
    if (typeof firebase !== 'undefined') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        dbRef = firebase.database().ref('building_bills');
        console.log('✅ Firebase initialized');
    } else {
        throw new Error('Firebase library not loaded');
    }
} catch (e) {
    firebaseError = e.message;
    console.error('❌ Firebase init error:', e);
}

const DB_KEYS = {
    UNITS: 'building_bills_units',
    READINGS: 'building_bills_readings',
    BILLS: 'building_bills_bills',
    SETTINGS: 'building_bills_settings',
    LAST_READING: 'building_bills_last_reading'
};

const DEFAULT_UNITS = [
    { id: 'unit_1', number: '۱', ownerName: 'واحد یک', electricityMeter: 'E-001', phone: '' },
    { id: 'unit_2', number: '۲', ownerName: 'واحد دو', electricityMeter: 'E-002', phone: '' },
    { id: 'unit_3', number: '۳', ownerName: 'واحد سه', electricityMeter: 'E-003', phone: '' },
    { id: 'unit_4', number: '۴', ownerName: 'واحد چهار', electricityMeter: 'E-004', phone: '' },
    { id: 'unit_5', number: '۵', ownerName: 'واحد پنج', electricityMeter: 'E-005', phone: '' }
];

// Jalali date converter (Gregorian -> Solar Hijri)
// Parses YYYY-MM-DD directly to avoid timezone issues
function toJalali(dateStr) {
    if (!dateStr) return '-';
    // Parse components directly from YYYY-MM-DD string to avoid timezone shift
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
        // Fallback for other formats using Date
        const g = new Date(dateStr);
        if (isNaN(g.getTime())) return dateStr;
        return toJalali(g.toISOString().slice(0, 10));
    }
    let gy = parseInt(parts[1], 10);
    const gm = parseInt(parts[2], 10);
    const gd = parseInt(parts[3], 10);
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy = (gy <= 1600) ? gy - 621 : gy - 1600;
    let gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + (parseInt((gy2 + 3) / 4)) - (parseInt((gy2 + 99) / 100)) + (parseInt((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * parseInt(days / 12053);
    days %= 12053;
    jy += 4 * parseInt(days / 1461);
    days %= 1461;
    jy += parseInt((days - 1) / 365);
    if (days > 365) days = (days - 1) % 365;
    const jm = (days < 186) ? 1 + parseInt(days / 31) : 7 + parseInt((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

function todayJalali() {
    return toJalali(new Date().toISOString().slice(0, 10));
}

const DEFAULT_SETTINGS = {
    electricityRate: 2500, // per kWh
    waterRate: 5000,       // per cubic meter
    buildingName: 'ساختمان مسکونی',
    managerName: '',
    address: ''
};

// Local cache synced with Firebase
const localCache = {};
let firebaseReady = false;
let pendingWrites = 0;

function updateSyncIndicator() {
    let el = document.getElementById('sync-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sync-indicator';
        el.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;padding:4px 10px;border-radius:12px;font-size:12px;font-family:Vazirmatn,sans-serif;transition:all 0.3s;cursor:pointer;';
        el.title = 'برای بررسی وضعیت کلیک کنید';
        el.onclick = showDiagnostics;
        document.body.appendChild(el);
    }
    if (firebaseError) {
        el.textContent = '❌ خطای Firebase';
        el.style.background = '#f8d7da';
        el.style.color = '#721c24';
        return;
    }
    if (!dbRef) {
        el.textContent = '⚠️ اتصال Firebase برقرار نیست';
        el.style.background = '#fff3cd';
        el.style.color = '#856404';
        return;
    }
    if (pendingWrites > 0) {
        el.textContent = '⏳ در حال ذخیره‌سازی...';
        el.style.background = '#cce5ff';
        el.style.color = '#004085';
    } else if (firebaseReady) {
        el.textContent = '✓ همگام‌سازی شده';
        el.style.background = '#d4edda';
        el.style.color = '#155724';
    } else {
        el.textContent = '🔄 در حال اتصال...';
        el.style.background = '#e2e3e5';
        el.style.color = '#383d41';
    }
}

function showDiagnostics() {
    const existing = document.getElementById('diag-panel');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'diag-panel';
    panel.style.cssText = 'position:fixed;top:40px;left:10px;z-index:9998;background:#fff;border:1px solid #ddd;border-radius:8px;padding:15px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:Vazirmatn,sans-serif;font-size:13px;max-width:320px;line-height:1.8;direction:rtl;text-align:right;';
    const checks = [
        ['کتابخانه Firebase', typeof firebase !== 'undefined' ? '✅ بارگذاری شد' : '❌ بارگذاری نشد'],
        ['مقداردهی Firebase', firebaseApp ? '✅ انجام شد' : '❌ انجام نشد'],
        ['اتصال دیتابیس', dbRef ? '✅ برقرار است' : '❌ برقرار نیست'],
        ['خطا', firebaseError || 'ندارد'],
        ['وضعیت همگام', firebaseReady ? '✅ متصل' : '⏳ در انتظار'],
        ['ذخیره‌سازی محلی', '❌ غیرفعال (فقط Firebase)']
    ];
    panel.innerHTML = '<strong>🔍 بررسی وضعیت</strong><hr style="margin:8px 0;border:none;border-top:1px solid #eee;">' +
        checks.map(([k,v]) => `<div><span style="color:#666">${k}:</span> <span style="font-weight:600">${v}</span></div>`).join('');
    document.body.appendChild(panel);
    setTimeout(() => { if(document.getElementById('diag-panel')) panel.remove(); }, 8000);
}

function setData(key, value) {
    localCache[key] = value;
    if (dbRef) {
        pendingWrites++;
        updateSyncIndicator();
        dbRef.child(key).set(value).then(() => {
            pendingWrites--;
            updateSyncIndicator();
        }).catch(err => {
            console.error('Firebase write error:', err);
            pendingWrites--;
            updateSyncIndicator();
        });
    }
}

function getData(key, defaultValue = null) {
    if (localCache.hasOwnProperty(key)) return localCache[key];
    return defaultValue;
}

// Initialize Firebase listeners for real-time sync
let renderTimeout = null;
function debouncedRender() {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        renderDashboard();
        renderUnits();
        renderReadingsHistory();
        loadSettings();
        updatePeriodSelects();
    }, 300);
}

function initFirebaseSync() {
    if (!dbRef) {
        updateSyncIndicator();
        return;
    }
    Object.values(DB_KEYS).forEach(key => {
        // First check if data exists; if not, seed defaults
        dbRef.child(key).once('value').then(snapshot => {
            if (snapshot.val() === null) {
                if (key === DB_KEYS.UNITS) {
                    dbRef.child(key).set(DEFAULT_UNITS);
                } else if (key === DB_KEYS.SETTINGS) {
                    dbRef.child(key).set(DEFAULT_SETTINGS);
                }
                // READINGS, BILLS, LAST_READING stay empty
            }
        }).catch(err => {
            console.error('Firebase once error for', key, err);
        });

        // Real-time listener
        dbRef.child(key).on('value', snapshot => {
            const val = snapshot.val();
            if (val !== null) {
                localCache[key] = val;
                debouncedRender();
            }
            firebaseReady = true;
            updateSyncIndicator();
        }, err => {
            console.error('Firebase read error for', key, err);
            firebaseReady = false;
            updateSyncIndicator();
        });
    });
    dbRef.child('.info/connected').on('value', snap => {
        if (snap.val() === true) {
            firebaseReady = true;
            updateSyncIndicator();
        }
    }, () => {});
}

function getUnits() {
    return getData(DB_KEYS.UNITS, JSON.parse(JSON.stringify(DEFAULT_UNITS)));
}

function saveUnits(units) {
    setData(DB_KEYS.UNITS, units);
}

function getReadings() {
    return getData(DB_KEYS.READINGS, []);
}

function saveReadings(readings) {
    setData(DB_KEYS.READINGS, readings);
}

function getBills() {
    return getData(DB_KEYS.BILLS, []);
}

function saveBills(bills) {
    setData(DB_KEYS.BILLS, bills);
}

function getSettings() {
    return getData(DB_KEYS.SETTINGS, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
}

function saveSettingsData(settings) {
    setData(DB_KEYS.SETTINGS, settings);
}

function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

function readFileAsDataURL(file) {
    return compressImage(file);
}

function getLastReading() {
    return getData(DB_KEYS.LAST_READING, null);
}

function saveLastReading(reading) {
    setData(DB_KEYS.LAST_READING, reading);
}

// ============================
// UI NAVIGATION
// ============================

function showSection(sectionId, clickedBtn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    if (clickedBtn) clickedBtn.classList.add('active');
    
    // Refresh section data
    if (sectionId === 'units') renderUnits();
    if (sectionId === 'readings') renderReadingForm();
    if (sectionId === 'readings') renderReadingsHistory();
    if (sectionId === 'calculations') updatePeriodSelects();
    if (sectionId === 'bills') updatePeriodSelects();
    if (sectionId === 'dashboard') renderDashboard();
    if (sectionId === 'settings') loadSettings();
}

// ============================
// DASHBOARD
// ============================

function renderDashboard() {
    const units = getUnits();
    const readings = getReadings();
    const bills = getBills();
    
    document.getElementById('totalUnits').textContent = units.length;
    document.getElementById('totalBills').textContent = bills.length;
    
    const latestTable = document.querySelector('#latestReadingsTable tbody');
    const noMsg = document.getElementById('noReadingsMsg');
    
    if (readings.length === 0) {
        latestTable.innerHTML = '';
        noMsg.style.display = 'block';
        return;
    }
    
    noMsg.style.display = 'none';
    const latest = readings.slice(-3).reverse(); // Last 3
    
    latestTable.innerHTML = latest.map(r => {
        const totalElec = r.subElectricity.reduce((s, m) => s + m.consumption, 0);
        const diffElec = r.mainElectricity.consumption - totalElec;
        const status = diffElec < 0 ? 'badge-danger' : 'badge-success';
        const statusText = diffElec < 0 ? 'مشکل در قرائت' : 'تأیید';
        
        return `
            <tr>
                <td>${r.period}</td>
                <td>${toJalali(r.date)}</td>
                <td>${r.mainElectricity.consumption.toFixed(2)} کیلووات</td>
                <td>${totalElec.toFixed(2)} کیلووات</td>
                <td>${diffElec.toFixed(2)} کیلووات</td>
                <td><span class="badge ${status}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

// ============================
// UNITS MANAGEMENT
// ============================

function renderUnits() {
    const units = getUnits();
    const tbody = document.querySelector('#unitsTable tbody');
    
    tbody.innerHTML = units.map(u => `
        <tr>
            <td>واحد ${u.number}</td>
            <td>${u.ownerName}</td>
            <td>${u.electricityMeter}</td>
            <td>${u.phone || '-'}</td>
            <td>
                <button class="btn btn-primary btn-small" onclick="editUnit('${u.id}')">✏️ ویرایش</button>
                <button class="btn btn-danger btn-small" onclick="deleteUnit('${u.id}')">🗑️ حذف</button>
            </td>
        </tr>
    `).join('');
}

function showAddUnitModal() {
    document.getElementById('modalTitle').textContent = 'افزودن واحد جدید';
    document.getElementById('unitForm').reset();
    document.getElementById('unitId').value = '';
    document.getElementById('unitModal').classList.add('active');
}

function editUnit(unitId) {
    const units = getUnits();
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;
    
    document.getElementById('modalTitle').textContent = 'ویرایش واحد';
    document.getElementById('unitId').value = unit.id;
    document.getElementById('unitNumber').value = unit.number;
    document.getElementById('ownerName').value = unit.ownerName;
    document.getElementById('electricityMeterNumber').value = unit.electricityMeter;
    document.getElementById('phoneNumber').value = unit.phone;
    
    document.getElementById('unitModal').classList.add('active');
}

function closeUnitModal() {
    document.getElementById('unitModal').classList.remove('active');
}

function saveUnit(e) {
    e.preventDefault();
    const units = getUnits();
    const id = document.getElementById('unitId').value;
    
    const unitData = {
        id: id || 'unit_' + Date.now(),
        number: document.getElementById('unitNumber').value,
        ownerName: document.getElementById('ownerName').value,
        electricityMeter: document.getElementById('electricityMeterNumber').value,
        phone: document.getElementById('phoneNumber').value
    };
    
    if (id) {
        const idx = units.findIndex(u => u.id === id);
        if (idx >= 0) units[idx] = unitData;
    } else {
        units.push(unitData);
    }
    
    saveUnits(units);
    closeUnitModal();
    renderUnits();
}

function deleteUnit(unitId) {
    if (!confirm('آیا مطمئن هستید که می‌خواهید این واحد را حذف کنید؟')) return;
    const units = getUnits().filter(u => u.id !== unitId);
    saveUnits(units);
    renderUnits();
}

// ============================
// READINGS
// ============================

function renderReadingForm() {
    const units = getUnits();
    const elecContainer = document.getElementById('subElectricityMeters');

    elecContainer.innerHTML = '<h4>مترهای فرعی برق:</h4>' + units.map(u => `
        <div class="sub-meter-row">
            <div class="unit-label">واحد ${u.number} (${u.ownerName})</div>
            <div class="form-group">
                <label for="elec_current_${u.id}">رقم فعلی</label>
                <input type="number" id="elec_current_${u.id}" required min="0" step="0.01" placeholder="رقم فعلی">
            </div>
            <div class="form-group">
                <label for="elec_prev_${u.id}">رقم قبلی</label>
                <input type="number" id="elec_prev_${u.id}" min="0" step="0.01" placeholder="رقم قبلی">
            </div>
            <div class="form-group">
                <label for="elec_photo_${u.id}">عکس کنتور</label>
                <input type="file" id="elec_photo_${u.id}" accept="image/*" onchange="previewMeterPhoto(this, '${u.id}')">
                <img id="elec_photo_preview_${u.id}" class="meter-photo-preview" style="display:none" onclick="openImageModal(this.src)">
            </div>
        </div>
    `).join('');
}

async function previewMeterPhoto(input, unitId) {
    const file = input.files[0];
    if (!file) return;
    try {
        const compressed = await compressImage(file);
        const img = document.getElementById('elec_photo_preview_' + unitId);
        img.src = compressed;
        img.style.display = 'block';
        // Store compressed data on input element for submission
        input.dataset.compressed = compressed;
    } catch (err) {
        console.error('Image compression error:', err);
        // Fallback to uncompressed preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('elec_photo_preview_' + unitId);
            img.src = e.target.result;
            img.style.display = 'block';
            input.dataset.compressed = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function openImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `<div class="image-modal-content" onclick="this.parentElement.remove()">
        <img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <p style="color:#fff;margin-top:10px;">برای بستن کلیک کنید</p>
    </div>`;
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:9999;cursor:pointer;';
    document.body.appendChild(modal);
}

function loadPreviousReading() {
    const lastReading = getLastReading();
    if (!lastReading) {
        alert('هنوز قرائتی ثبت نشده است.');
        return;
    }

    if (lastReading.mainElectricity) {
        document.getElementById('mainElectricityPrevious').value = lastReading.mainElectricity.current || '';
    }
    if (lastReading.mainWater) {
        document.getElementById('mainWaterPrevious').value = lastReading.mainWater.current || '';
    }

    const units = getUnits();
    units.forEach(u => {
        const elecPrev = document.getElementById(`elec_prev_${u.id}`);
        if (elecPrev) {
            const found = lastReading.subElectricity?.find(m => m.unitId === u.id);
            if (found) elecPrev.value = found.current || '';
        }
        // Clear photo preview and input
        const photoInput = document.getElementById(`elec_photo_${u.id}`);
        if (photoInput) photoInput.value = '';
        const photoPreview = document.getElementById(`elec_photo_preview_${u.id}`);
        if (photoPreview) {
            photoPreview.src = '';
            photoPreview.style.display = 'none';
        }
    });

    alert('ارقام قرائت قبلی در فیلدهای "رقم قبلی" بارگذاری شد.');
}

async function submitReading(e) {
    e.preventDefault();

    const units = getUnits();
    const period = document.getElementById('period').value;
    const date = document.getElementById('readingDate').value;

    if (!period || !date) {
        alert('لطفاً دوره و تاریخ را وارد کنید.');
        return;
    }

    // Main meters
    const mainElecCurrent = parseFloat(document.getElementById('mainElectricityCurrent').value) || 0;
    const mainElecPrev = parseFloat(document.getElementById('mainElectricityPrevious').value) || 0;
    const mainWaterCurrent = parseFloat(document.getElementById('mainWaterCurrent').value) || 0;
    const mainWaterPrev = parseFloat(document.getElementById('mainWaterPrevious').value) || 0;

    // Validation: current must be >= previous
    if (mainElecCurrent < mainElecPrev) {
        alert('خطا: رقم فعلی متر عمومی برق نمی‌تواند کمتر از رقم قبلی باشد.');
        return;
    }
    if (mainWaterCurrent < mainWaterPrev) {
        alert('خطا: رقم فعلی متر عمومی آب نمی‌تواند کمتر از رقم قبلی باشد.');
        return;
    }

    // Sub meters - only electricity (async to read photos)
    const subElectricity = [];
    for (const u of units) {
        const current = parseFloat(document.getElementById(`elec_current_${u.id}`).value) || 0;
        const previous = parseFloat(document.getElementById(`elec_prev_${u.id}`).value) || 0;
        if (current < previous) {
            alert(`خطا: رقم فعلی متر برق فرعی واحد ${u.number} نمی‌تواند کمتر از رقم قبلی باشد.`);
            return;
        }
        const photoInput = document.getElementById(`elec_photo_${u.id}`);
        let photoData = null;
        if (photoInput) {
            if (photoInput.dataset.compressed) {
                photoData = photoInput.dataset.compressed;
            } else if (photoInput.files[0]) {
                photoData = await readFileAsDataURL(photoInput.files[0]);
            }
        }
        subElectricity.push({
            unitId: u.id,
            unitNumber: u.number,
            unitName: u.ownerName,
            current: current,
            previous: previous,
            consumption: current - previous,
            photo: photoData
        });
    }

    const totalWaterConsumption = mainWaterCurrent - mainWaterPrev;

    // Read main meter photos
    const mainElecPhotoInput = document.getElementById('mainElectricityPhoto');
    const mainWaterPhotoInput = document.getElementById('mainWaterPhoto');
    let mainElecPhoto = null;
    let mainWaterPhoto = null;
    if (mainElecPhotoInput) {
        if (mainElecPhotoInput.dataset.compressed) {
            mainElecPhoto = mainElecPhotoInput.dataset.compressed;
        } else if (mainElecPhotoInput.files[0]) {
            mainElecPhoto = await readFileAsDataURL(mainElecPhotoInput.files[0]);
        }
    }
    if (mainWaterPhotoInput) {
        if (mainWaterPhotoInput.dataset.compressed) {
            mainWaterPhoto = mainWaterPhotoInput.dataset.compressed;
        } else if (mainWaterPhotoInput.files[0]) {
            mainWaterPhoto = await readFileAsDataURL(mainWaterPhotoInput.files[0]);
        }
    }

    const reading = {
        id: 'reading_' + Date.now(),
        period: period,
        date: date,
        mainElectricity: {
            current: mainElecCurrent,
            previous: mainElecPrev,
            consumption: mainElecCurrent - mainElecPrev,
            photo: mainElecPhoto
        },
        mainWater: {
            current: mainWaterCurrent,
            previous: mainWaterPrev,
            consumption: totalWaterConsumption,
            photo: mainWaterPhoto
        },
        subElectricity: subElectricity,
        createdAt: new Date().toISOString()
    };

    const readings = getReadings();
    readings.push(reading);
    saveReadings(readings);
    saveLastReading(reading);
    
    // Generate bills for this reading
    generateBills(reading);
    
    alert(`قرائت دوره ${period} با موفقیت ثبت شد. قبض‌ها نیز صادر شدند.`);
    
    document.getElementById('readingForm').reset();
    renderReadingsHistory();
    renderDashboard();
    updatePeriodSelects();
}

function renderReadingsHistory() {
    const readings = getReadings().slice().reverse();
    const tbody = document.querySelector('#readingsHistoryTable tbody');
    
    if (readings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">هنوز قرائتی ثبت نشده.</td></tr>';
        return;
    }
    
    tbody.innerHTML = readings.map(r => {
        const totalElec = r.subElectricity.reduce((s, m) => s + m.consumption, 0);
        return `
            <tr>
                <td>${r.period}</td>
                <td>${toJalali(r.date)}</td>
                <td>${r.mainElectricity.consumption.toFixed(2)}</td>
                <td>${totalElec.toFixed(2)}</td>
                <td>${r.mainWater.consumption.toFixed(2)}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="viewReading('${r.id}')">👁️ مشاهده</button>
                    <button class="btn btn-danger btn-small" onclick="deleteReading('${r.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function viewReading(id) {
    // Show calculation for this reading
    showSection('calculations', null);
    document.getElementById('calcPeriodSelect').value = id;
    loadCalculation();
}

function deleteReading(id) {
    if (!confirm('آیا مطمئن هستید؟')) return;
    const readings = getReadings().filter(r => r.id !== id);
    saveReadings(readings);
    // Also delete related bills
    const bills = getBills().filter(b => b.readingId !== id);
    saveBills(bills);
    // If deleted reading was the lastReading, clear it
    const last = getLastReading();
    if (last && last.id === id) {
        if (dbRef) {
            dbRef.child(DB_KEYS.LAST_READING).remove();
        }
        delete localCache[DB_KEYS.LAST_READING];
    }
    renderReadingsHistory();
    renderDashboard();
    updatePeriodSelects();
}

// ============================
// CALCULATIONS & BILL GENERATION
// ============================

function getUnitPreviousDebt(unitId, currentReadingId) {
    return 0;
}

function generateBills(reading) {
    const settings = getSettings();
    const units = getUnits();
    const bills = getBills();
    
    const totalElecConsumption = reading.mainElectricity.consumption;
    const totalWaterConsumption = reading.mainWater.consumption;
    
    const totalElecCost = totalElecConsumption * settings.electricityRate;
    const totalWaterCost = totalWaterConsumption * settings.waterRate;
    
    const totalSubElec = reading.subElectricity.reduce((s, m) => s + m.consumption, 0);
    
    // Difference (common area consumption) - only for electricity
    const elecDiff = totalElecConsumption - totalSubElec;
    const elecDiffCost = elecDiff * settings.electricityRate;
    
    // Water is divided equally among units
    const waterPerUnit = units.length > 0 ? totalWaterConsumption / units.length : 0;
    const waterPerUnitCost = waterPerUnit * settings.waterRate;
    
    const newBills = units.map(u => {
        const elecSub = reading.subElectricity.find(m => m.unitId === u.id);
        const elecConsumption = elecSub ? elecSub.consumption : 0;
        const elecUnitCost = elecConsumption * settings.electricityRate;
        
        // Proportional common share based on unit's consumption
        let commonElecShare = 0;
        if (totalSubElec > 0) {
            commonElecShare = (elecConsumption / totalSubElec) * elecDiffCost;
        } else if (units.length > 0) {
            commonElecShare = elecDiffCost / units.length;
        }
        
        const currentCost = elecUnitCost + waterPerUnitCost + commonElecShare;
        
        return {
            id: 'bill_' + Date.now() + '_' + u.id,
            readingId: reading.id,
            period: reading.period,
            date: reading.date,
            unitId: u.id,
            unitNumber: u.number,
            unitName: u.ownerName,
            electricity: {
                consumption: elecConsumption,
                rate: settings.electricityRate,
                cost: elecUnitCost,
                commonShare: commonElecShare
            },
            water: {
                consumption: waterPerUnit,
                rate: settings.waterRate,
                cost: waterPerUnitCost,
                commonShare: 0
            },
            currentCost: currentCost,
            previousDebt: 0,
            totalCost: currentCost,
            paid: false,
            createdAt: new Date().toISOString()
        };
    });
    
    bills.push(...newBills);
    saveBills(bills);
}

function updatePeriodSelects() {
    const readings = getReadings();
    const options = readings.map(r => `<option value="${r.id}">${r.period} - ${toJalali(r.date)}</option>`).join('');
    
    const calcSelect = document.getElementById('calcPeriodSelect');
    const billSelect = document.getElementById('billPeriodSelect');
    
    const currentCalc = calcSelect.value;
    const currentBill = billSelect.value;
    
    calcSelect.innerHTML = '<option value="">انتخاب دوره...</option>' + options;
    billSelect.innerHTML = '<option value="">انتخاب دوره...</option>' + options;
    
    calcSelect.value = currentCalc;
    billSelect.value = currentBill;
}

function loadCalculation() {
    const readingId = document.getElementById('calcPeriodSelect').value;
    const container = document.getElementById('calculationResult');
    
    if (!readingId) {
        container.innerHTML = '<p class="empty-message">لطفاً یک دوره را انتخاب کنید.</p>';
        return;
    }
    
    const reading = getReadings().find(r => r.id === readingId);
    if (!reading) return;
    
    const settings = getSettings();
    const allBills = getBills();
    const billsForPeriod = allBills.filter(b => b.readingId === readingId);
    
    const totalElec = reading.mainElectricity.consumption;
    const totalWater = reading.mainWater.consumption;
    const totalElecCost = totalElec * settings.electricityRate;
    const totalWaterCost = totalWater * settings.waterRate;
    const totalSubElec = reading.subElectricity.reduce((s, m) => s + m.consumption, 0);
    const elecDiff = totalElec - totalSubElec;
    const elecDiffCost = elecDiff * settings.electricityRate;
    
    const units = getUnits();
    const waterPerUnit = totalWater / units.length;
    
    // Common electricity share proportional to each unit's consumption
    let unitCalcsHtml = units.map(u => {
        const elecSub = reading.subElectricity.find(m => m.unitId === u.id);
        const elecConsumption = elecSub ? elecSub.consumption : 0;
        const elecCost = elecConsumption * settings.electricityRate;

        // Proportional common share based on unit's consumption
        let commonElecShare = 0;
        if (totalSubElec > 0) {
            commonElecShare = (elecConsumption / totalSubElec) * elecDiffCost;
        } else if (units.length > 0) {
            commonElecShare = elecDiffCost / units.length;
        }

        const waterCost = waterPerUnit * settings.waterRate;
        const calcCurrentCost = elecCost + waterCost + commonElecShare;

        // Use saved bill data if available for accurate historical values
        const savedBill = billsForPeriod.find(b => b.unitId === u.id);
        const currentCost = savedBill ? (savedBill.currentCost ?? calcCurrentCost) : calcCurrentCost;
        const total = currentCost;

        const photoHtml = elecSub && elecSub.photo ? `
            <div style="margin-top:10px;">
                <span style="font-size:0.85em;color:#718096;">📷 عکس کنتور:</span>
                <img src="${elecSub.photo}" class="meter-photo-thumb" onclick="openImageModal('${elecSub.photo}')" alt="عکس کنتور واحد ${u.number}">
            </div>
        ` : '';

        return `
            <div class="unit-calc-card">
                <h4>🏠 واحد ${u.number} - ${u.ownerName}</h4>
                <div class="bill-row">
                    <span>مصرف برق:</span>
                    <span>${elecConsumption.toFixed(2)} کیلووات × ${formatNumber(settings.electricityRate)} = ${formatNumber(elecCost)}</span>
                </div>
                <div class="bill-row">
                    <span>سهم برق مشاع (نسبتی):</span>
                    <span>${formatNumber(commonElecShare)}</span>
                </div>
                <div class="bill-row">
                    <span>مصرف آب:</span>
                    <span>${waterPerUnit.toFixed(2)} متر مکعب × ${formatNumber(settings.waterRate)} = ${formatNumber(waterCost)}</span>
                </div>
                <div class="bill-row total">
                    <span>جمع کل قابل پرداخت:</span>
                    <span>${formatNumber(total)}</span>
                </div>
                ${photoHtml}
            </div>
        `;
    }).join('');
    
    // Verify totals match using saved bill data when available
    const totalCalculated = units.reduce((sum, u) => {
        const savedBill = billsForPeriod.find(b => b.unitId === u.id);
        if (savedBill) {
            return sum + (savedBill.totalCost || savedBill.currentCost || 0);
        }
        const elecSub = reading.subElectricity.find(m => m.unitId === u.id);
        const elecConsumption = elecSub ? elecSub.consumption : 0;
        let commonElecShare = 0;
        if (totalSubElec > 0) {
            commonElecShare = (elecConsumption / totalSubElec) * elecDiffCost;
        } else if (units.length > 0) {
            commonElecShare = elecDiffCost / units.length;
        }
        const currentCost = (elecConsumption * settings.electricityRate) + (waterPerUnit * settings.waterRate) + commonElecShare;
        return sum + currentCost;
    }, 0);
    
    container.innerHTML = `
        <div class="calc-summary">
            <h3>📊 خلاصه دوره ${reading.period}</h3>
            <div class="calc-summary-item">
                <span>مصرف کل برق (متر عمومی):</span>
                <span>${totalElec.toFixed(2)} کیلووات</span>
            </div>
            <div class="calc-summary-item">
                <span>مصرف کل آب (متر عمومی):</span>
                <span>${totalWater.toFixed(2)} متر مکعب</span>
            </div>
            <div class="calc-summary-item">
                <span>مجموع مصرف فرعی‌ها:</span>
                <span>${totalSubElec.toFixed(2)} کیلووات</span>
            </div>
            <div class="calc-summary-item">
                <span>اختلاف (مشاع):</span>
                <span>${elecDiff.toFixed(2)} کیلووات</span>
            </div>
            <div class="calc-summary-item">
                <span>هزینه کل برق:</span>
                <span>${formatNumber(totalElecCost)}</span>
            </div>
            <div class="calc-summary-item">
                <span>هزینه کل آب:</span>
                <span>${formatNumber(totalWaterCost)}</span>
            </div>
            <div class="calc-summary-item">
                <span>هزینه کل محاسبه شده:</span>
                <span>${formatNumber(totalCalculated)}</span>
            </div>
        </div>
        <h3 style="margin-top: 20px;">💰 محاسبه هر واحد:</h3>
        ${unitCalcsHtml}
    `;
}

// ============================
// BILLS MANAGEMENT
// ============================

function loadBills() {
    const readingId = document.getElementById('billPeriodSelect').value;
    const container = document.getElementById('billsContainer');
    
    if (!readingId) {
        container.innerHTML = '<p class="empty-message">لطفاً یک دوره را انتخاب کنید.</p>';
        return;
    }
    
    const bills = getBills().filter(b => b.readingId === readingId);
    if (bills.length === 0) {
        container.innerHTML = '<p class="empty-message">قبضی برای این دوره یافت نشد.</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="bills-grid">
            ${bills.map(b => {
                const currentCost = b.currentCost ?? b.totalCost ?? 0;
                return `
                <div class="bill-card">
                    <div class="bill-header">
                        <div>
                            <h3>واحد ${b.unitNumber}</h3>
                            <p>${b.unitName}</p>
                        </div>
                        <span class="badge ${b.paid ? 'badge-success' : 'badge-warning'}">${b.paid ? 'پرداخت شده' : 'پرداخت نشده'}</span>
                    </div>
                    <div class="bill-body">
                        <div class="bill-row">
                            <span>مصرف برق:</span>
                            <span>${b.electricity.consumption.toFixed(2)} کیلووات</span>
                        </div>
                        <div class="bill-row">
                            <span>هزینه برق:</span>
                            <span>${formatNumber(b.electricity.cost)}</span>
                        </div>
                        <div class="bill-row">
                            <span>سهم مشاع برق:</span>
                            <span>${formatNumber(b.electricity.commonShare)}</span>
                        </div>
                        <div class="bill-row">
                            <span>مصرف آب:</span>
                            <span>${b.water.consumption.toFixed(2)} متر مکعب</span>
                        </div>
                        <div class="bill-row">
                            <span>هزینه آب:</span>
                            <span>${formatNumber(b.water.cost)}</span>
                        </div>
                        <div class="bill-row total">
                            <span>جمع کل قابل پرداخت:</span>
                            <span>${formatNumber(b.totalCost)}</span>
                        </div>
                        <div class="form-actions" style="margin-top: 15px;">
                            <button class="btn btn-primary btn-small" onclick="showBill('${b.id}')">🧾 مشاهده قبض</button>
                            <button class="btn btn-success btn-small" onclick="togglePaid('${b.id}')">${b.paid ? '↩️ بازگردانی' : '✅ پرداخت شد'}</button>
                            <button class="btn btn-secondary btn-small" onclick="printBill('${b.id}')">🖨️ پرینت</button>
                        </div>
                    </div>
                </div>
            `;
            }).join('')}
        </div>
    `;
}

function togglePaid(billId) {
    const bills = getBills();
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;

    bill.paid = !bill.paid;
    saveBills(bills);
    loadBills();
}

// ============================
// BILL PRINTING
// ============================

function getBillPrintHTML(bill, reading, settings, commonElecShare, totalCost, currentCost) {
    currentCost = currentCost ?? totalCost;
    
    return `
        <div class="bill-print">
            <div class="bill-print-header">
                <h2>${settings.buildingName}</h2>
                <p>قبض مصرف برق و آب - دوره ${bill.period}</p>
            </div>
            <div class="bill-print-info">
                <div>

                    <p><strong>تاریخ:</strong> ${toJalali(bill.date)}</p>
                    <p><strong>مدیریت:</strong> ${settings.managerName || '-'}</p>
                </div>
                <div>
                    <p><strong>واحد:</strong> ${bill.unitNumber}</p>
                    <p><strong>صاحب خانه:</strong> ${bill.unitName}</p>
                    <p><strong>آدرس:</strong> ${settings.address || '-'}</p>
                </div>
            </div>
            <table class="bill-print-table">
                <thead>
                    <tr>
                        <th>شرح</th>
                        <th>مصرف</th>
                        <th>نرخ</th>
                        <th>مبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>برق مصرفی</td>
                        <td>${bill.electricity.consumption.toFixed(2)} کیلووات</td>
                        <td>${formatNumber(bill.electricity.rate)}</td>
                        <td>${formatNumber(bill.electricity.cost)}</td>
                    </tr>
                    <tr>
                        <td>سهم برق مشاع (نسبتی)</td>
                        <td>-</td>
                        <td>-</td>
                        <td>${formatNumber(commonElecShare)}</td>
                    </tr>
                    <tr>
                        <td>آب مصرفی</td>
                        <td>${bill.water.consumption.toFixed(2)} متر مکعب</td>
                        <td>${formatNumber(bill.water.rate)}</td>
                        <td>${formatNumber(bill.water.cost)}</td>
                    </tr>
                    <tr style="font-weight: bold; background: #2d3748; color: white;">
                        <td colspan="3">جمع کل قابل پرداخت</td>
                        <td>${formatNumber(totalCost)}</td>
                    </tr>
                </tbody>
            </table>
            <div class="bill-print-footer">
                <div>
                    <p><strong>وضعیت:</strong> ${bill.paid ? 'پرداخت شده ✓' : 'پرداخت نشده'}</p>
                </div>
                <div style="text-align: left;">
                    <p>امضای مدیریت: _______________</p>
                </div>
            </div>
        </div>
    `;
}

let currentModalBillId = null;

function showBill(billId) {
    const bill = getBills().find(b => b.id === billId);
    if (!bill) return;
    
    currentModalBillId = billId;
    
    const settings = getSettings();
    const reading = getReadings().find(r => r.id === bill.readingId);
    
    // Use stored values from bill - do not recalculate to preserve historical accuracy
    const commonElecShare = bill.electricity.commonShare || 0;
    const currentCost = bill.currentCost ?? bill.totalCost ?? 0;
    const totalCost = bill.totalCost || currentCost;
    
    const html = getBillPrintHTML(bill, reading, settings, commonElecShare, totalCost, currentCost);
    
    document.getElementById('billPrintBody').innerHTML = html;
    document.getElementById('billPrintModal').classList.add('active');
}

function closeBillPrintModal() {
    document.getElementById('billPrintModal').classList.remove('active');
    currentModalBillId = null;
}

function printCurrentBill() {
    if (currentModalBillId) {
        printBill(currentModalBillId);
    }
}

function openPrintWindow(contentHtml) {
    // حذف iframe قبلی اگر وجود دارد
    const existing = document.getElementById('printIframe');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'printIframe';
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;left:-9999px;top:-9999px;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="fa">
        <head>
            <meta charset="UTF-8">
            <title>قبوض</title>
            <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page { size: A5 portrait; margin: 10mm; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: 'Vazirmatn', Tahoma, sans-serif; font-size: 10pt; background: white; direction: rtl; color: #333; }
                .bill-print { width: 100%; padding: 0; margin: 0; page-break-inside: avoid; page-break-after: always; }
                .bill-print:last-child { page-break-after: auto; }
                .bill-print-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px; }
                .bill-print-header h2 { font-size: 14pt; margin: 0 0 8px 0; color: #2d3748; }
                .bill-print-header p { font-size: 10pt; margin: 0; color: #666; }
                .bill-print-info { display: flex; justify-content: space-between; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; font-size: 9pt; }
                .bill-print-info > div { flex: 1; min-width: 140px; }
                .bill-print-info p { margin: 4px 0; }
                .bill-print-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                .bill-print-table th, .bill-print-table td { border: 1px solid #333; padding: 6px 8px; text-align: right; font-size: 9pt; }
                .bill-print-table th { background: #f0f0f0; color: #333; font-weight: bold; }
                .bill-print-footer { margin-top: 20px; display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 15px; font-size: 9pt; }
            </style>
        </head>
        <body>
            ${contentHtml}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 500);

    // پاک کردن iframe بعد از چاپ
    setTimeout(() => {
        const pi = document.getElementById('printIframe');
        if (pi) pi.remove();
    }, 60000);
}

function printBill(billId) {
    const bill = getBills().find(b => b.id === billId);
    if (!bill) return;
    
    const settings = getSettings();
    const reading = getReadings().find(r => r.id === bill.readingId);
    
    const commonElecShare = bill.electricity.commonShare || 0;
    const currentCost = bill.currentCost ?? bill.totalCost ?? 0;
    const totalCost = bill.totalCost || currentCost;
    
    const html = getBillPrintHTML(bill, reading, settings, commonElecShare, totalCost, currentCost);
    openPrintWindow(html);
}

// ============================
// SETTINGS
// ============================

function loadSettings() {
    const settings = getSettings();
    document.getElementById('electricityRate').value = settings.electricityRate;
    document.getElementById('waterRate').value = settings.waterRate;
    document.getElementById('buildingName').value = settings.buildingName;
    document.getElementById('managerName').value = settings.managerName;
    document.getElementById('address').value = settings.address;
}

function saveSettings(e) {
    e.preventDefault();
    const settings = {
        electricityRate: parseFloat(document.getElementById('electricityRate').value) || 2500,
        waterRate: parseFloat(document.getElementById('waterRate').value) || 5000,
        buildingName: document.getElementById('buildingName').value || 'ساختمان مسکونی',
        managerName: document.getElementById('managerName').value || '',
        address: document.getElementById('address').value || ''
    };
    saveSettingsData(settings);
    alert('تنظیمات با موفقیت ذخیره شد.');
}

function resetAllData() {
    if (!confirm('⚠️ آیا واقعاً می‌خواهید همه داده‌ها را حذف کنید؟ این عمل قابل بازگشت نیست!')) return;
    if (!confirm('آخرین تأیید: همه واحدها، قرائت‌ها و قبض‌ها حذف خواهند شد.')) return;
    
    if (dbRef) {
        dbRef.remove().then(() => {
            alert('همه داده‌ها از Firebase حذف شدند.');
            location.reload();
        }).catch(err => {
            alert('خطا در حذف داده‌ها: ' + err.message);
        });
    } else {
        alert('اتصال Firebase برقرار نیست. امکان حذف داده‌ها وجود ندارد.');
    }
}

// ============================
// UTILITIES
// ============================

function formatNumber(num) {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
}

// ============================
// INIT
// ============================

// ============================
// BACKUP / RESTORE
// ============================
function exportBackup() {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        units: getUnits(),
        readings: getReadings(),
        bills: getBills(),
        settings: getSettings()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `building-bills-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ فایل پشتیبان با موفقیت دانلود شد.');
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup.units || !backup.readings || !backup.bills || !backup.settings) {
                alert('فایل نامعتبر است. اطلاعات کامل نیست.');
                return;
            }
            if (!confirm('بازیابی پشتیبان تمام داده‌های فعلی را جایگزین می‌کند. آیا مطمئن هستید؟')) {
                return;
            }
            setData(DB_KEYS.UNITS, backup.units);
            setData(DB_KEYS.READINGS, backup.readings);
            setData(DB_KEYS.BILLS, backup.bills);
            saveSettingsData(backup.settings);
            renderDashboard();
            renderUnits();
            renderReadingForm();
            renderReadingsHistory();
            updatePeriodSelects();
            loadSettings();
            showToast('✅ پشتیبان با موفقیت بازیابی شد.');
        } catch (err) {
            alert('خطا در خواندن فایل پشتیبان: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#2d3748;color:#fff;padding:12px 24px;border-radius:8px;z-index:10000;font-size:0.95em;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function init() {
    // Start Firebase real-time sync (will seed defaults if DB is empty)
    initFirebaseSync();

    // Initial render (will refresh once Firebase data arrives)
    renderDashboard();
    renderUnits();
    renderReadingForm();
    renderReadingsHistory();
    updatePeriodSelects();
    loadSettings();
    
    // Set today's date
    const dateInput = document.getElementById('readingDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Run init when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Close modals on outside click
window.onclick = function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
};
