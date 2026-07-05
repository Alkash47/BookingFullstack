// NEXUS Meeting Room Booking App Logic
const API_BASE = window.location.origin;

// Global Fetch Interceptor to handle Refresh Token rotation
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // Ensure credentials option is set for auth requests so cookies are sent/received
    if (url.includes('/auth/refresh') || url.includes('/auth/token') || url.includes('/auth/logout')) {
        options.credentials = 'include';
    }

    let response = await originalFetch(url, options);

    // If access token is expired (401), try to refresh it
    if (response.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/token')) {
        try {
            const refreshRes = await originalFetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            if (refreshRes.ok) {
                const data = await refreshRes.json();
                localStorage.setItem('token', data.access_token);

                // Update Authorization header in the retried request
                if (!options.headers) {
                    options.headers = {};
                }
                if (options.headers.Authorization) {
                    options.headers.Authorization = `Bearer ${data.access_token}`;
                } else if (options.headers['Authorization']) {
                    options.headers['Authorization'] = `Bearer ${data.access_token}`;
                }

                // Retry the original request
                response = await originalFetch(url, options);
            } else {
                // Refresh failed, clean up token (user will need to re-authenticate)
                localStorage.removeItem('token');
            }
        } catch (err) {
            console.error('Failed to auto-refresh token:', err);
        }
    }
    return response;
};


// State management
let currentUser = null;
let roomsData = [];
let selectedRoomId = null; // Dynamically loaded room ID
let selectedDate = null; // YYYY-MM-DD
let selectedStartTime = "09:00";
let selectedEndTime = "10:00";
let selectedExtras = []; // array of extra IDs

// Extra addon rates mapping
const EXTRA_RATES = {
    catering: 400,
    records: 200,
    assistant: 500
};

// Russian month names for date selector
const MONTHS_RU = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const MONTHS_FULL_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initFAQ();
    initSlider();
    initCalendar();
    checkAuth();
    setupEventListeners();
});

// --- TOAST NOTIFICATIONS ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-dot"></span>
        <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
    
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        localStorage.setItem('theme', theme);
    });
}

// --- FAQ ACCORDION ---
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const btn = item.querySelector('.faq-question-btn');
        const answer = item.querySelector('.faq-answer');
        
        btn.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close other items
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-answer').style.maxHeight = null;
            });
            
            if (!isActive) {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
}

// --- ROOM CATALOG RENDERING ---
function renderRoomsCatalog(rooms) {
    const tabsContainer = document.getElementById('catalog-rooms-tabs');
    const detailsContainer = document.getElementById('catalog-rooms-details');
    if (!tabsContainer || !detailsContainer) return;

    let activeRoomId = selectedRoomId || (rooms.length > 0 ? rooms[0].id : null);

    tabsContainer.innerHTML = '';
    detailsContainer.innerHTML = '';

    rooms.forEach((room) => {
        // Create tab button
        const tabBtn = document.createElement('button');
        const isActive = room.id === activeRoomId;
        tabBtn.className = `room-tab ${isActive ? 'active' : ''}`;
        tabBtn.setAttribute('data-room-id', room.id);
        
        tabBtn.innerHTML = `
            <h3>${room.name}</h3>
            <div class="tab-meta">
                <span>${room.capacity}</span>
                <span>от ${room.price.toLocaleString('ru-RU')} ₽/ч</span>
            </div>
        `;

        tabBtn.addEventListener('click', () => {
            selectRoom(room.id);
        });

        tabsContainer.appendChild(tabBtn);

        // Create detail panel
        const panel = document.createElement('div');
        panel.className = `room-detail-panel ${isActive ? 'active' : ''}`;
        panel.id = `room-panel-${room.id}`;

        let roomBadge = "Premium Space";
        let noiseSpec = "До 35 дБ (Акустические панели)";
        let equipSpec = "65\" интерактивная панель, PTZ-камера";
        let extraSpec = "Спикерфон Jabra с охватом 360°";
        
        if (room.id === 1 || room.name.toLowerCase().includes("focus")) {
            roomBadge = "Для быстрых встреч";
            noiseSpec = "До 40 дБ (Двойное остекление)";
            equipSpec = "50\" 4K дисплей, маркерное стекло";
            extraSpec = "Индивидуальный приток воздуха";
        } else if (room.id === 2 || room.name.toLowerCase().includes("collab") || room.name.toLowerCase().includes("hub")) {
            roomBadge = "Для командной работы";
            noiseSpec = "До 35 дБ (Акустические панели)";
            equipSpec = "65\" интерактивная панель, PTZ-камера";
            extraSpec = "Спикерфон Jabra с охватом 360°";
        } else if (room.id === 3 || room.name.toLowerCase().includes("boardroom") || room.name.toLowerCase().includes("executive")) {
            roomBadge = "Премиум статус";
            noiseSpec = "Премиум-класс (Слоеный гипсокартон)";
            equipSpec = "Два 85\" 4K экрана, проектор";
            extraSpec = "Мини-бар, выделенный ассистент";
        }

        panel.innerHTML = `
            <div class="room-gallery">
                <img src="${room.image_url}" alt="${room.name}">
            </div>
            <div class="room-info">
                <span class="badge" style="width: fit-content;">${roomBadge}</span>
                <h3>${room.name}</h3>
                <p class="room-desc">${room.description}</p>
                <div class="room-specs">
                    <div class="spec-box">
                        <span class="spec-label">Вместимость</span>
                        <span class="spec-val">${room.capacity}</span>
                    </div>
                    <div class="spec-box">
                        <span class="spec-label">Шумоизоляция</span>
                        <span class="spec-val">${noiseSpec}</span>
                    </div>
                    <div class="spec-box">
                        <span class="spec-label">Оборудование</span>
                        <span class="spec-val">${equipSpec}</span>
                    </div>
                    <div class="spec-box">
                        <span class="spec-label">Особенности</span>
                        <span class="spec-val">${extraSpec}</span>
                    </div>
                </div>
                <div class="room-price-book">
                    <div class="room-price-box">
                        <span class="price-sub">Цена за час</span>
                        <span class="price-val">${room.price.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    <button class="btn btn-primary trigger-booking" data-room-id="${room.id}">Забронировать</button>
                </div>
            </div>
        `;

        panel.querySelector('.trigger-booking').addEventListener('click', () => {
            selectRoom(room.id);
            const calcSection = document.getElementById('calculator');
            if (calcSection) {
                calcSection.scrollIntoView({ behavior: 'smooth' });
            }
        });

        detailsContainer.appendChild(panel);
    });
}

function renderCalcRoomSelector(rooms) {
    const container = document.getElementById('calc-room-selector');
    if (!container) return;

    container.innerHTML = '';
    rooms.forEach((room) => {
        const optionBtn = document.createElement('div');
        const isActive = room.id === selectedRoomId;
        optionBtn.className = `option-btn ${isActive ? 'selected' : ''}`;
        optionBtn.setAttribute('data-room-id', room.id);
        optionBtn.innerHTML = `<span>${room.name}</span>`;

        optionBtn.addEventListener('click', () => {
            selectRoom(room.id);
        });

        container.appendChild(optionBtn);
    });
}

function generateTimeOptions() {
    updateTimeline();
}

// --- TESTIMONIAL SLIDER ---
function initSlider() {
    const track = document.getElementById('testimonial-track');
    const slides = document.querySelectorAll('.testimonial-slide');
    const prevBtn = document.getElementById('prev-slide');
    const nextBtn = document.getElementById('next-slide');
    let currentIndex = 0;
    
    if (!track || slides.length === 0) return;
    
    const updateSlider = () => {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
    };
    
    prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex > 0) ? currentIndex - 1 : slides.length - 1;
        updateSlider();
    });
    
    nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex < slides.length - 1) ? currentIndex + 1 : 0;
        updateSlider();
    });
}

// --- CALENDAR GENERATION ---
function initCalendar() {
    const selector = document.getElementById('calc-date-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const nextDate = new Date();
        nextDate.setDate(today.getDate() + i);
        
        const year = nextDate.getFullYear();
        const month = String(nextDate.getMonth() + 1).padStart(2, '0');
        const day = String(nextDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        const dateBtn = document.createElement('div');
        dateBtn.className = `date-btn ${i === 0 ? 'selected' : ''}`;
        dateBtn.setAttribute('data-date', dateString);
        
        dateBtn.innerHTML = `
            <span class="date-day">${day}</span>
            <span class="date-month">${MONTHS_RU[nextDate.getMonth()]}</span>
        `;
        
        if (i === 0) {
            selectedDate = dateString;
        }
        
        dateBtn.addEventListener('click', () => {
            document.querySelectorAll('.date-btn').forEach(btn => btn.classList.remove('selected'));
            dateBtn.classList.add('selected');
            selectedDate = dateString;
            selectedSlots = [];
            loadSlots();
        });
        
        selector.appendChild(dateBtn);
    }
    
    loadSlots();
}

// --- ROOM SELECTION ---
function selectRoom(roomId) {
    selectedRoomId = parseInt(roomId);
    selectedSlots = [];
    
    // Update active tab buttons in catalog
    document.querySelectorAll('.room-tab').forEach(tab => {
        if (parseInt(tab.getAttribute('data-room-id')) === selectedRoomId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update active panels in catalog
    document.querySelectorAll('.room-detail-panel').forEach(panel => {
        if (panel.id === `room-panel-${selectedRoomId}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
    
    // Update active tab buttons in calculator
    document.querySelectorAll('#calc-room-selector .option-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-room-id')) === selectedRoomId) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
    
    loadSlots();
}

// --- FETCH SLOTS & ROOMS FROM BACKEND ---
async function loadSlots() {
    const bookedTimesContainer = document.getElementById('booked-times-container');
    const bookedTimesList = document.getElementById('booked-times-list');
    
    try {
        const res = await fetch(`${API_BASE}/rooms?date=${selectedDate}`);
        if (!res.ok) throw new Error('Failed to load slots');
        
        const rooms = await res.json();
        roomsData = rooms;
        
        if (rooms.length === 0) {
            if (bookedTimesContainer) bookedTimesContainer.style.display = 'none';
            return;
        }

        // Set default selected room if not set or invalid
        if (selectedRoomId === null || !rooms.some(r => r.id === selectedRoomId)) {
            selectedRoomId = rooms[0].id;
        }
        
        // Render dynamic UI
        renderRoomsCatalog(rooms);
        renderCalcRoomSelector(rooms);
        generateTimeOptions();
        
        // Find current room
        const currentRoom = rooms.find(r => r.id === selectedRoomId);
        if (!currentRoom) return;
        
        // Render booked intervals on the selected date
        if (bookedTimesContainer && bookedTimesList) {
            bookedTimesList.innerHTML = '';
            
            if (currentRoom.booked_intervals && currentRoom.booked_intervals.length > 0) {
                currentRoom.booked_intervals.sort((a, b) => a.start.localeCompare(b.start));
                
                currentRoom.booked_intervals.forEach(interval => {
                    const span = document.createElement('span');
                    span.className = 'badge';
                    span.style.cssText = 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-weight: 500; font-size: 0.8rem; margin: 2px;';
                    span.textContent = `${interval.start} - ${interval.end}`;
                    bookedTimesList.appendChild(span);
                });
                bookedTimesContainer.style.display = 'block';
            } else {
                const span = document.createElement('span');
                span.style.color = '#10b981';
                span.style.fontWeight = '500';
                span.textContent = 'Все время свободно';
                bookedTimesList.appendChild(span);
                bookedTimesContainer.style.display = 'block';
            }
        }
        
        // Draw occupied blocks on the timeline slider
        renderOccupiedTimelineSlots(currentRoom.booked_intervals);
        
        validateBookingTime();
        
    } catch (err) {
        console.error(err);
    }
}

function timeToMinutes(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToTime(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function updateTimeline() {
    const startInput = document.getElementById('timeline-start-val');
    const endInput = document.getElementById('timeline-end-val');
    const selectedRange = document.getElementById('timeline-selected-range');
    
    if (!startInput || !endInput || !selectedRange) return;
    
    let startMin = parseInt(startInput.value);
    let endMin = parseInt(endInput.value);
    
    if (startMin > endMin - 5) {
        if (document.activeElement === startInput) {
            endMin = startMin + 5;
            endInput.value = endMin;
        } else {
            startMin = endMin - 5;
            startInput.value = startMin;
        }
    }
    
    selectedStartTime = minutesToTime(startMin);
    selectedEndTime = minutesToTime(endMin);
    
    const minVal = parseInt(startInput.min);
    const maxVal = parseInt(startInput.max);
    const range = maxVal - minVal;
    
    const leftPct = ((startMin - minVal) / range) * 100;
    const widthPct = ((endMin - startMin) / range) * 100;
    
    selectedRange.style.left = `${leftPct}%`;
    selectedRange.style.width = `${widthPct}%`;
    
    // Обновляем лейблы времени над ползунками
    const startLabelEl = document.getElementById('timeline-start-label');
    const endLabelEl = document.getElementById('timeline-end-label');
    if (startLabelEl) {
        startLabelEl.textContent = minutesToTime(startMin);
        const startOffset = 9 - 18 * (leftPct / 100);
        startLabelEl.style.left = `calc(${leftPct}% + ${startOffset}px)`;
    }
    if (endLabelEl) {
        endLabelEl.textContent = minutesToTime(endMin);
        const endPct = leftPct + widthPct;
        const endOffset = 9 - 18 * (endPct / 100);
        endLabelEl.style.left = `calc(${endPct}% + ${endOffset}px)`;
    }
    
    // Синхронизируем текстовые поля времени
    const startInputTime = document.getElementById('timeline-start-input');
    const endInputTime = document.getElementById('timeline-end-input');
    if (startInputTime && document.activeElement !== startInputTime) {
        startInputTime.value = minutesToTime(startMin);
    }
    if (endInputTime && document.activeElement !== endInputTime) {
        endInputTime.value = minutesToTime(endMin);
    }
    
    validateBookingTime();
}

function renderOccupiedTimelineSlots(bookedIntervals) {
    const occupiedContainer = document.getElementById('timeline-occupied-slots');
    if (!occupiedContainer) return;
    
    occupiedContainer.innerHTML = '';
    if (!bookedIntervals || bookedIntervals.length === 0) return;
    
    const minVal = 480;
    const maxVal = 1320;
    const range = maxVal - minVal;
    
    bookedIntervals.forEach(interval => {
        const startMin = timeToMinutes(interval.start);
        const endMin = timeToMinutes(interval.end);
        
        const startClamped = Math.max(minVal, Math.min(maxVal, startMin));
        const endClamped = Math.max(minVal, Math.min(maxVal, endMin));
        
        if (endClamped > startClamped) {
            const leftPct = ((startClamped - minVal) / range) * 100;
            const widthPct = ((endClamped - startClamped) / range) * 100;
            
            const block = document.createElement('div');
            block.style.position = 'absolute';
            block.style.height = '100%';
            block.style.left = `${leftPct}%`;
            block.style.width = `${widthPct}%`;
            block.style.background = 'rgba(239, 68, 68, 0.35)';
            block.style.borderRadius = '2px';
            block.style.pointerEvents = 'none';
            occupiedContainer.appendChild(block);
        }
    });
}

function validateBookingTime() {
    const statusMsg = document.getElementById('time-status-message');
    const confirmBtn = document.getElementById('open-booking-modal');
    
    if (!statusMsg || !confirmBtn) return;
    
    const startMin = timeToMinutes(selectedStartTime);
    const endMin = timeToMinutes(selectedEndTime);
    
    statusMsg.style.display = 'none';
    confirmBtn.disabled = false;
    
    if (startMin >= endMin) {
        statusMsg.textContent = 'Ошибка: Время окончания должно быть позже времени начала.';
        statusMsg.style.color = '#ef4444';
        statusMsg.style.display = 'block';
        confirmBtn.disabled = true;
        updateCalculations(0);
        return;
    }
    
    if (endMin - startMin < 15) {
        statusMsg.textContent = 'Ошибка: Минимальное время бронирования — 15 минут.';
        statusMsg.style.color = '#ef4444';
        statusMsg.style.display = 'block';
        confirmBtn.disabled = true;
        updateCalculations(0);
        return;
    }
    
    const currentRoom = roomsData.find(r => r.id === selectedRoomId);
    if (currentRoom && currentRoom.booked_intervals) {
        let hasConflict = false;
        let conflictInterval = null;
        
        for (const interval of currentRoom.booked_intervals) {
            const bStart = timeToMinutes(interval.start);
            const bEnd = timeToMinutes(interval.end);
            
            if (startMin < bEnd && endMin > bStart) {
                hasConflict = true;
                conflictInterval = interval;
                break;
            }
        }
        
        if (hasConflict) {
            statusMsg.textContent = `Ошибка: Выбранное время пересекается с существующим бронированием (${conflictInterval.start} - ${conflictInterval.end}).`;
            statusMsg.style.color = '#ef4444';
            statusMsg.style.display = 'block';
            confirmBtn.disabled = true;
            updateCalculations(0);
            return;
        }
    }
    
    statusMsg.textContent = 'Выбранное время свободно!';
    statusMsg.style.color = '#10b981';
    statusMsg.style.display = 'block';
    
    updateCalculations();
}

// --- UPDATE CALCULATIONS & SUMMARY ---
function updateCalculations(customTotalPrice = null) {
    const currentRoom = roomsData.find(r => r.id === selectedRoomId);
    if (!currentRoom) return;

    const roomRate = currentRoom.price;
    let extraRates = 0;
    
    selectedExtras.forEach(extra => {
        extraRates += EXTRA_RATES[extra] || 0;
    });
    
    const startMin = timeToMinutes(selectedStartTime);
    const endMin = timeToMinutes(selectedEndTime);
    const durationHours = (endMin - startMin) / 60;
    
    let totalPrice = (roomRate + extraRates) * durationHours;
    if (customTotalPrice !== null) {
        totalPrice = customTotalPrice;
    }
    
    // Update DOM summary fields
    document.getElementById('summary-room-name').textContent = currentRoom.name;
    document.getElementById('summary-room-rate').textContent = `${roomRate} ₽/ч`;
    
    // Date formatting
    const d = new Date(selectedDate);
    const dateFormatted = `${d.getDate()} ${MONTHS_FULL_RU[d.getMonth()]} ${d.getFullYear()}`;
    document.getElementById('summary-date').textContent = dateFormatted;
    
    // Slots display
    const slotsInfo = document.getElementById('summary-slots');
    if (durationHours > 0 && customTotalPrice === null) {
        slotsInfo.textContent = `${selectedStartTime} - ${selectedEndTime} (${durationHours.toFixed(1)} ч.)`;
    } else {
        slotsInfo.textContent = 'не выбрано';
    }
    
    // Extras row
    const extrasRow = document.getElementById('summary-extras-row');
    const extrasVal = document.getElementById('summary-extras-val');
    if (selectedExtras.length > 0) {
        extrasRow.style.display = 'flex';
        extrasVal.textContent = `+${extraRates} ₽/ч`;
    } else {
        extrasRow.style.display = 'none';
    }
    
    // Total
    document.getElementById('summary-total-price').textContent = `${totalPrice.toLocaleString('ru-RU')} ₽`;
}

// --- AUTHENTICATION STATE CHECK ---
async function checkAuth() {
    const token = localStorage.getItem('token');
    const authBtn = document.getElementById('auth-header-btn');
    const myBookingsSection = document.getElementById('my-bookings');
    const adminPanel = document.getElementById('admin-panel');
    
    if (!token) {
        currentUser = null;
        authBtn.textContent = 'Войти';
        authBtn.classList.remove('logged-in');
        myBookingsSection.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            throw new Error('Unauthorized');
        }
        
        const user = await res.json();
        currentUser = user;
        
        // UI updates for authenticated user
        authBtn.textContent = user.full_name || user.username;
        authBtn.classList.add('logged-in');
        myBookingsSection.style.display = 'block';
        
        // Render admin panel if user is admin
        if (user.is_admin) {
            if (adminPanel) {
                adminPanel.style.display = 'block';
                loadAdminRooms();
            }
        } else {
            if (adminPanel) adminPanel.style.display = 'none';
        }
        
        loadMyBookings();
        
    } catch (err) {
        console.warn('Auth token expired or invalid:', err);
        localStorage.removeItem('token');
        currentUser = null;
        authBtn.textContent = 'Войти';
        authBtn.classList.remove('logged-in');
        myBookingsSection.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'none';
    }
}

// --- BOOKING OPERATIONS ---
async function loadMyBookings() {
    const listContainer = document.getElementById('bookings-list');
    const emptyState = document.getElementById('bookings-empty');
    const token = localStorage.getItem('token');
    
    if (!listContainer || !token) return;
    
    try {
        const res = await fetch(`${API_BASE}/bookings/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Failed to load bookings');
        
        const bookings = await res.json();
        
        if (bookings.length === 0) {
            listContainer.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        listContainer.innerHTML = '';
        
        // Group bookings by date
        const grouped = {};
        bookings.forEach(b => {
            if (!grouped[b.date]) grouped[b.date] = [];
            grouped[b.date].push(b);
        });
        
        // Sort dates chronologically
        const sortedDates = Object.keys(grouped).sort();
        
        sortedDates.forEach(dateStr => {
            const dateObj = new Date(dateStr);
            const headerText = `${dateObj.getDate()} ${MONTHS_FULL_RU[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            
            const groupDiv = document.createElement('div');
            groupDiv.className = 'booking-date-group';
            groupDiv.innerHTML = `
                <div class="booking-date-heading">${headerText}</div>
                <div class="booking-cards-container"></div>
            `;
            
            const cardsContainer = groupDiv.querySelector('.booking-cards-container');
            
            // Sort bookings in same day by slot time
            grouped[dateStr].sort((a, b) => a.slot_start.localeCompare(b.slot_start));
            
            grouped[dateStr].forEach(booking => {
                const card = document.createElement('div');
                card.className = 'booking-card';
                card.innerHTML = `
                    <div>
                        <div class="booking-card-room">${booking.room_name}</div>
                        <div class="booking-card-time">Время: ${booking.slot_start} - ${booking.slot_end}</div>
                    </div>
                    <button class="btn-cancel-booking" data-booking-id="${booking.id}">
                        Отменить бронь
                    </button>
                `;
                
                card.querySelector('.btn-cancel-booking').addEventListener('click', async () => {
                    if (confirm('Вы уверены, что хотите отменить бронирование?')) {
                        await cancelBooking(booking.id);
                    }
                });
                
                cardsContainer.appendChild(card);
            });
            
            listContainer.appendChild(groupDiv);
        });
        
    } catch (err) {
        console.error(err);
        listContainer.innerHTML = '<div style="color: #ef4444; padding: 2rem 0;">Ошибка при загрузке ваших бронирований.</div>';
    }
}

async function cancelBooking(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/bookings/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Cancel failed');
        
        showToast('Бронирование успешно отменено');
        loadMyBookings();
        loadSlots(); // Refresh slots grid
        
    } catch (err) {
        showToast('Не удалось отменить бронирование');
    }
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    // Extras options toggle click
    const extraButtons = document.querySelectorAll('#calc-extras .option-btn');
    extraButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const extraId = btn.getAttribute('data-extra-id');
            const idx = selectedExtras.indexOf(extraId);
            
            if (idx > -1) {
                selectedExtras.splice(idx, 1);
                btn.classList.remove('selected');
            } else {
                selectedExtras.push(extraId);
                btn.classList.add('selected');
            }
            updateCalculations();
        });
    });
    
    // Auth header button click (Trigger Login Modal or Logout)
    const authBtn = document.getElementById('auth-header-btn');
    authBtn.addEventListener('click', () => {
        if (currentUser) {
            if (confirm(`Выйти из аккаунта (${currentUser.username})?`)) {
                fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(err => console.error(err));
                localStorage.removeItem('token');
                currentUser = null;
                showToast('Вы успешно вышли из аккаунта');
                checkAuth();
            }
        } else {
            openAuthModal();
        }
    });
    
    // Auth Modal open/close controls
    const closeAuthBtn = document.getElementById('close-auth-modal');
    const authOverlay = document.getElementById('auth-modal-overlay');
    closeAuthBtn.addEventListener('click', () => authOverlay.classList.remove('active'));
    
    // Switch states in auth modal
    document.getElementById('switch-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-login-state').style.display = 'none';
        document.getElementById('auth-register-state').style.display = 'block';
    });
    
    document.getElementById('switch-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-register-state').style.display = 'none';
        document.getElementById('auth-login-state').style.display = 'block';
    });
    
    // Login Form Submit
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Register Form Submit
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // Open Booking modal details
    document.getElementById('open-booking-modal').addEventListener('click', () => {
        if (!currentUser) {
            showToast('Пожалуйста, авторизуйтесь для завершения бронирования');
            openAuthModal();
            return;
        }
        
        openBookingModal();
    });
    
    // Close Booking modal
    document.getElementById('close-booking-modal').addEventListener('click', closeBookingModal);
    document.getElementById('close-success-btn').addEventListener('click', closeBookingModal);
    
    // Confirm booking submit
    document.getElementById('confirm-booking-btn').addEventListener('click', submitBookings);

    // Collapsible steps listeners
    document.querySelectorAll('.step-header').forEach(header => {
        header.addEventListener('click', () => {
            const stepGroup = header.closest('.step-group');
            if (stepGroup) {
                stepGroup.classList.toggle('collapsed');
            }
        });
    });

    // Timeline range slider listeners
    const startValInput = document.getElementById('timeline-start-val');
    const endValInput = document.getElementById('timeline-end-val');
    
    if (startValInput && endValInput) {
        startValInput.addEventListener('input', updateTimeline);
        endValInput.addEventListener('input', updateTimeline);
        
        const bringStartToTop = () => {
            startValInput.style.zIndex = '4';
            endValInput.style.zIndex = '3';
        };
        const bringEndToTop = () => {
            endValInput.style.zIndex = '4';
            startValInput.style.zIndex = '3';
        };
        
        startValInput.addEventListener('mousedown', bringStartToTop);
        startValInput.addEventListener('touchstart', bringStartToTop);
        endValInput.addEventListener('mousedown', bringEndToTop);
        endValInput.addEventListener('touchstart', bringEndToTop);
        
        // Initial update
        updateTimeline();
        
        // Manual time inputs event listeners
        const startInputTime = document.getElementById('timeline-start-input');
        const endInputTime = document.getElementById('timeline-end-input');
        if (startInputTime && endInputTime) {
            const handleTimeInputChange = () => {
                let startVal = startInputTime.value;
                let endVal = endInputTime.value;
                if (!startVal || !endVal) return;
                
                let startMin = timeToMinutes(startVal);
                let endMin = timeToMinutes(endVal);
                
                // Clamp between 08:00 (480) and 22:00 (1320)
                startMin = Math.max(480, Math.min(1320, startMin));
                endMin = Math.max(480, Math.min(1320, endMin));
                
                if (startMin > endMin - 5) {
                    if (document.activeElement === startInputTime) {
                        endMin = startMin + 5;
                        endInputTime.value = minutesToTime(endMin);
                    } else {
                        startMin = endMin - 5;
                        startInputTime.value = minutesToTime(startMin);
                    }
                }
                
                startValInput.value = startMin;
                endValInput.value = endMin;
                updateTimeline();
            };
            
            startInputTime.addEventListener('input', handleTimeInputChange);
            endInputTime.addEventListener('input', handleTimeInputChange);
        }
    }

    // Admin room controls event listeners
    const addRoomBtn = document.getElementById('admin-add-room-btn');
    if (addRoomBtn) {
        addRoomBtn.addEventListener('click', () => openAdminRoomModal());
    }

    const closeAdminRoomBtn = document.getElementById('close-admin-room-modal');
    if (closeAdminRoomBtn) {
        closeAdminRoomBtn.addEventListener('click', closeAdminRoomModal);
    }

    const adminRoomForm = document.getElementById('admin-room-form');
    if (adminRoomForm) {
        adminRoomForm.addEventListener('submit', saveAdminRoom);
    }
}

// --- AUTH ACTIONS ---
function openAuthModal() {
    const authOverlay = document.getElementById('auth-modal-overlay');
    document.getElementById('auth-register-state').style.display = 'none';
    document.getElementById('auth-login-state').style.display = 'block';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('login-form').reset();
    authOverlay.classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const userVal = document.getElementById('login-username').value.trim();
    const passVal = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.style.display = 'none';
    
    try {
        const formData = new URLSearchParams();
        formData.append('username', userVal);
        formData.append('password', passVal);
        
        const res = await fetch(`${API_BASE}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Неверный логин или пароль');
        }
        
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        
        document.getElementById('auth-modal-overlay').classList.remove('active');
        showToast('Вход выполнен успешно');
        await checkAuth();
        
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const fullnameVal = document.getElementById('reg-fullname').value.trim();
    const userVal = document.getElementById('reg-username').value.trim();
    const passVal = document.getElementById('reg-password').value;
    const errorDiv = document.getElementById('register-error');
    
    errorDiv.style.display = 'none';
    
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: userVal,
                password: passVal,
                full_name: fullnameVal
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Ошибка регистрации. Имя пользователя может быть занято.');
        }
        
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        
        document.getElementById('auth-modal-overlay').classList.remove('active');
        showToast('Регистрация завершена успешно');
        await checkAuth();
        
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

// --- BOOKING MODAL ACTIONS ---
function openBookingModal() {
    const overlay = document.getElementById('booking-modal-overlay');
    const formState = document.getElementById('modal-form-state');
    const successState = document.getElementById('modal-success-state');
    const detailsContainer = document.getElementById('booking-confirm-details');
    
    formState.style.display = 'block';
    successState.style.display = 'none';
    
    const currentRoom = roomsData.find(r => r.id === selectedRoomId);
    if (!currentRoom) return;

    const roomRate = currentRoom.price;
    let extraRates = 0;
    const extrasList = [];
    
    selectedExtras.forEach(extra => {
        extraRates += EXTRA_RATES[extra] || 0;
        if (extra === 'catering') extrasList.push('Кофе-брейк');
        if (extra === 'records') extrasList.push('Запись & Трансляция');
        if (extra === 'assistant') extrasList.push('Ассистент');
    });
    
    const startMin = timeToMinutes(selectedStartTime);
    const endMin = timeToMinutes(selectedEndTime);
    const durationHours = (endMin - startMin) / 60;
    const totalPrice = (roomRate + extraRates) * durationHours;
    
    const d = new Date(selectedDate);
    const dateFormatted = `${d.getDate()} ${MONTHS_FULL_RU[d.getMonth()]} ${d.getFullYear()}`;
    
    detailsContainer.innerHTML = `
        <div class="confirm-detail-row">
            <span>Зона встречи:</span>
            <span class="bold">${currentRoom.name}</span>
        </div>
        <div class="confirm-detail-row">
            <span>Дата:</span>
            <span class="bold">${dateFormatted}</span>
        </div>
        <div class="confirm-detail-row">
            <span>Время бронирования:</span>
            <span class="bold">${selectedStartTime} - ${selectedEndTime} (${durationHours.toFixed(1)} ч.)</span>
        </div>
        <div class="confirm-detail-row">
            <span>Дополнительные опции:</span>
            <span class="bold">${extrasList.length > 0 ? extrasList.join(', ') : 'нет'}</span>
        </div>
        <div class="confirm-detail-row total">
            <span>Итого:</span>
            <span class="bold">${totalPrice.toLocaleString('ru-RU')} ₽</span>
        </div>
    `;
    
    overlay.classList.add('active');
}

function closeBookingModal() {
    document.getElementById('booking-modal-overlay').classList.remove('active');
}

async function submitBookings() {
    const token = localStorage.getItem('token');
    const confirmBtn = document.getElementById('confirm-booking-btn');
    
    if (!token) return;
    
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Оформление...';
    
    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                room_id: selectedRoomId,
                date: selectedDate,
                start_time: selectedStartTime,
                end_time: selectedEndTime
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Не удалось забронировать выбранный интервал времени.');
        }
        
        // Show success state
        document.getElementById('modal-form-state').style.display = 'none';
        document.getElementById('modal-success-state').style.display = 'flex';
        
        // Refresh grids and data
        loadSlots();
        loadMyBookings();
        
    } catch (err) {
        showToast(err.message);
        closeBookingModal();
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Подтвердить бронирование';
    }
}

// --- ADMIN ROOM ACTIONS ---
async function loadAdminRooms() {
    const listContainer = document.getElementById('admin-rooms-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Загрузка комнат...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/rooms?date=${selectedDate}`);
        if (!res.ok) throw new Error('Failed to load admin rooms');
        
        const rooms = await res.json();
        
        if (rooms.length === 0) {
            listContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Список комнат пуст.</div>';
            return;
        }
        
        listContainer.innerHTML = '';
        
        rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'admin-room-card';
            card.style.cssText = `
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-lg);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                transition: transform 0.2s, box-shadow 0.2s;
            `;
            
            card.innerHTML = `
                <div style="height: 180px; overflow: hidden; position: relative;">
                    <img src="${room.image_url}" alt="${room.name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <span style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.75); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; border: 1px solid rgba(255,255,255,0.1);">${room.capacity}</span>
                </div>
                <div style="padding: 1.5rem; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; font-weight: 600; color: var(--text-primary);">${room.name}</h4>
                        <p style="margin: 0 0 1.25rem 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; height: 3.8em;">${room.description}</p>
                        <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1.5rem;">${room.price.toLocaleString('ru-RU')} ₽ / час</div>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <button class="btn btn-secondary edit-room-btn" data-room-id="${room.id}" style="flex-grow: 1; padding: 0.6rem 1rem; font-size: 0.85rem;">Редактировать</button>
                        <button class="btn delete-room-btn" data-room-id="${room.id}" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); flex-grow: 1; padding: 0.6rem 1rem; font-size: 0.85rem; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; font-weight: 500;">Удалить</button>
                    </div>
                </div>
            `;
            
            // Edit room handler
            card.querySelector('.edit-room-btn').addEventListener('click', () => {
                openAdminRoomModal(room);
            });
            
            // Delete room handler
            card.querySelector('.delete-room-btn').addEventListener('click', async () => {
                if (confirm(`Вы уверены, что хотите удалить комнату "${room.name}"? Это также удалит все связанные бронирования!`)) {
                    await deleteAdminRoom(room.id);
                }
            });
            
            listContainer.appendChild(card);
        });
        
    } catch (err) {
        console.error(err);
        listContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #ef4444;">Не удалось загрузить список комнат в панели администратора.</div>';
    }
}

function openAdminRoomModal(room = null) {
    const overlay = document.getElementById('admin-room-modal-overlay');
    const form = document.getElementById('admin-room-form');
    const title = document.getElementById('admin-room-modal-title');
    const subtitle = document.getElementById('admin-room-modal-subtitle');
    
    if (!overlay || !form) return;
    
    form.reset();
    
    if (room) {
        title.textContent = 'Редактирование комнаты';
        subtitle.textContent = `Изменение параметров переговорной зоны "${room.name}".`;
        
        document.getElementById('admin-room-id').value = room.id;
        document.getElementById('admin-room-name').value = room.name;
        document.getElementById('admin-room-price').value = room.price;
        document.getElementById('admin-room-capacity').value = room.capacity;
        document.getElementById('admin-room-desc').value = room.description;
        document.getElementById('admin-room-image').value = room.image_url;
    } else {
        title.textContent = 'Добавление новой комнаты';
        subtitle.textContent = 'Заполните поля ниже, чтобы добавить новую переговорную зону в систему.';
        
        document.getElementById('admin-room-id').value = '';
        document.getElementById('admin-room-image').value = 'images/deep_focus.png';
    }
    
    overlay.classList.add('active');
}

function closeAdminRoomModal() {
    const overlay = document.getElementById('admin-room-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function saveAdminRoom(e) {
    if (e) e.preventDefault();
    
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const submitBtn = document.getElementById('admin-room-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение...';
    
    const roomId = document.getElementById('admin-room-id').value;
    const name = document.getElementById('admin-room-name').value.trim();
    const price = parseInt(document.getElementById('admin-room-price').value);
    const capacity = document.getElementById('admin-room-capacity').value.trim();
    const description = document.getElementById('admin-room-desc').value.trim();
    const imageUrl = document.getElementById('admin-room-image').value;
    
    const isEdit = !!roomId;
    const url = isEdit ? `${API_BASE}/admin/rooms/${roomId}` : `${API_BASE}/admin/rooms`;
    const method = isEdit ? 'PUT' : 'POST';
    
    const payload = {
        name,
        price,
        capacity,
        description,
        image_url: imageUrl
    };
    
    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Не удалось сохранить комнату');
        }
        
        showToast(isEdit ? 'Параметры комнаты успешно обновлены' : 'Новая комната успешно добавлена');
        closeAdminRoomModal();
        
        // Refresh catalog & calculator & admin panel
        await loadSlots();
        if (currentUser && currentUser.is_admin) {
            await loadAdminRooms();
        }
        
    } catch (err) {
        showToast(err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Сохранить изменения';
    }
}

async function deleteAdminRoom(roomId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const res = await fetch(`${API_BASE}/admin/rooms/${roomId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Не удалось удалить комнату');
        }
        
        showToast('Комната успешно удалена из системы');
        
        if (selectedRoomId === roomId) {
            selectedRoomId = null;
        }
        
        // Refresh catalog & calculator & admin panel
        await loadSlots();
        if (currentUser && currentUser.is_admin) {
            await loadAdminRooms();
        }
        
    } catch (err) {
        showToast(err.message);
    }
}
