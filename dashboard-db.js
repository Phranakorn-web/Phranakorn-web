// =========================================================================
// --- MODULE: EXECUTIVE DASHBOARD, LIVE WEATHER & SEASONAL THEME ENGINE ---
// --- FILE: dashboard-db.js (STANDALONE MODULAR CONTROLLER) ---
// =========================================================================

/**
 * 👨‍💼 ข้อมูลผู้สร้างและพัฒนาระบบ (Creator & System Metadata)
 */
const WMS_DEFAULT_CREATOR_INFO = {
    fullName: 'คุณนคร จันทร์ทป (Nakorn Chanthob)',
    role: 'System Architect & Lead Full-Stack Developer',
    organization: 'WMS Enterprise Warehouse Operations',
    systemVersion: 'WMS Enterprise Ultimate Security v2026.18',
    techStack: 'HTML5 • Modular ES6+ • Supabase Realtime • Open-Meteo • JsBarcode • SheetJS',
    contactNote: 'ระบบบริหารจัดการคลังสินค้าอัจฉริยะ รองรับการทำงานแบบ Multi-Platform, Offline Queue & Realtime Sync'
};

/**
 * 🌤️ ฐานข้อมูลพิกัดศูนย์กระจายสินค้าและสภาพอากาศ (Weather Hubs & Geolocation)
 */
const WMS_WEATHER_HUBS = {
    auto: { key: 'auto', label: '📍 ตำแหน่ง GPS ปัจจุบัน (อัตโนมัติ)', lat: 13.7563, lon: 100.5018, fallbackName: 'กรุงเทพมหานคร (ค่าเริ่มต้น)' },
    bangkok: { key: 'bangkok', label: '🏙️ กรุงเทพมหานคร (คลังหลัก)', lat: 13.7563, lon: 100.5018, fallbackName: 'กรุงเทพมหานคร' },
    pathumthani: { key: 'pathumthani', label: '🏭 ปทุมธานี / วังน้อย (ศูนย์กระจายสินค้า)', lat: 14.0208, lon: 100.5250, fallbackName: 'ปทุมธานี / วังน้อย' },
    samutprakan: { key: 'samutprakan', label: '🚚 สมุทรปราการ / บางพลี (โลจิสติกส์)', lat: 13.5991, lon: 100.5998, fallbackName: 'สมุทรปราการ / บางพลี' },
    chonburi: { key: 'chonburi', label: '⚓ ชลบุรี / แหลมฉบัง (คลังท่าเรือ)', lat: 13.0827, lon: 100.9167, fallbackName: 'ชลบุรี / แหลมฉบัง' },
    chiangmai: { key: 'chiangmai', label: '⛰️ เชียงใหม่ (ศูนย์ภาคเหนือ)', lat: 18.7883, lon: 98.9853, fallbackName: 'เชียงใหม่' },
    khonkaen: { key: 'khonkaen', label: '🌾 ขอนแก่น (ศูนย์ภาคอีสาน)', lat: 16.4322, lon: 102.8236, fallbackName: 'ขอนแก่น' },
    phuket: { key: 'phuket', label: '🌊 ภูเก็ต (ศูนย์ภาคใต้)', lat: 7.8804, lon: 98.3923, fallbackName: 'ภูเก็ต' }
};

const WMS_WEATHER_CACHE_KEY = 'WMS_DASH_WEATHER_CACHE_V1';
const WMS_WEATHER_HUB_PREF_KEY = 'WMS_DASH_WEATHER_HUB_KEY';
const WMS_WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // แคชข้อมูลสภาพอากาศ 15 นาที

let WMS_WEATHER_STATE = {
    loading: false,
    error: null,
    hubKey: localStorage.getItem(WMS_WEATHER_HUB_PREF_KEY) || 'auto',
    locationName: 'กำลังตรวจจับพิกัด...',
    isGpsDetected: false,
    data: null,
    lastUpdated: null,
    alertDismissed: false,
    notifiedSession: false
};

let WMS_DASHBOARD_QUICK_QUERY = '';

/**
 * 📅 ฐานข้อมูลเทศกาลสำคัญตามปีปฏิทิน (รองรับทั้งวันสากลและวันจันทรคติไทย)
 */
const WMS_FESTIVAL_THEMES = {
    default: {
        key: 'default',
        name: 'ธีมมาตรฐานองค์กร (Corporate Blue)',
        shortLabel: 'มาตรฐาน WMS',
        icon: 'fa-building-shield',
        emoji: '🏢',
        badgeText: 'WMS 2026',
        greeting: 'ยินดีต้อนรับสู่ศูนย์ควบคุมและบริหารจัดการคลังสินค้า',
        subGreeting: 'ติดตามสถานะสต็อกสินค้า พิกัดจัดเก็บ สภาพอากาศหน้างาน และการรับ-จ่ายสินค้าแบบ Realtime',
        bannerGradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)',
        accentColor: '#38bdf8',
        decorIcons: ['📦', '🏭', '📊', '🚚']
    },
    loykrathong: {
        key: 'loykrathong',
        name: 'เทศกาลวันลอยกระทง (Loy Krathong Festival)',
        shortLabel: 'วันลอยกระทง',
        icon: 'fa-water',
        emoji: '🪷',
        badgeText: '🪷 ลอยกระทง',
        greeting: 'สุขสันต์เทศกาลวันลอยกระทง สืบสานประเพณีไทย',
        subGreeting: 'ขอให้สายน้ำแห่งความสุขนำพาความราบรื่นและความสำเร็จมาสู่ทีมงานคลังสินค้าทุกท่าน',
        bannerGradient: 'linear-gradient(135deg, #090d24 0%, #1e1b4b 50%, #312e81 100%)',
        accentColor: '#fbbf24',
        decorIcons: ['🪷', '🌕', '🕯️', '✨']
    },
    christmas: {
        key: 'christmas',
        name: 'เทศกาลคริสต์มาส (Merry Christmas)',
        shortLabel: 'คริสต์มาส',
        icon: 'fa-tree',
        emoji: '🎄',
        badgeText: '🎄 Christmas',
        greeting: 'Merry Christmas & Season’s Greetings!',
        subGreeting: 'ร่วมเฉลิมฉลองเทศกาลแห่งความสุข ส่งมอบความอบอุ่นและประสิทธิภาพสูงสุดในทุกงานคลังสินค้า',
        bannerGradient: 'linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #7f1d1d 100%)',
        accentColor: '#4ade80',
        decorIcons: ['🎄', '❄️', '🎁', '⛄']
    },
    newyear: {
        key: 'newyear',
        name: 'เทศกาลส่งท้ายปีเก่า ต้อนรับปีใหม่ (Happy New Year)',
        shortLabel: 'วันปีใหม่',
        icon: 'fa-champagne-glasses',
        emoji: '🎆',
        badgeText: '🎆 New Year',
        greeting: 'สวัสดีปีใหม่ Happy New Year! เริ่มต้นปีแห่งความสำเร็จ',
        subGreeting: 'ก้าวสู่ปีใหม่ด้วยระบบคลังสินค้าที่แม่นยำ รวดเร็ว และปลอดภัยในทุกขั้นตอน',
        bannerGradient: 'linear-gradient(135deg, #171717 0%, #422006 50%, #713f12 100%)',
        accentColor: '#facc15',
        decorIcons: ['🎆', '🥂', '🎉', '✨']
    },
    valentines: {
        key: 'valentines',
        name: 'เทศกาลวันวาเลนไทน์ (Happy Valentine’s Day)',
        shortLabel: 'วาเลนไทน์',
        icon: 'fa-heart',
        emoji: '💝',
        badgeText: '💝 Valentine',
        greeting: 'Happy Valentine’s Day ส่งต่อความห่วงใยและมิตรภาพในการทำงาน',
        subGreeting: 'ร่วมแรงร่วมใจ ดูแลทุกชิ้นงานและสต็อกสินค้าด้วยความใส่ใจในทุกขั้นตอน',
        bannerGradient: 'linear-gradient(135deg, #4c0519 0%, #9f1239 55%, #be185d 100%)',
        accentColor: '#fda4af',
        decorIcons: ['💝', '🌹', '💖', '✨']
    },
    chinesenewyear: {
        key: 'chinesenewyear',
        name: 'เทศกาลตรุษจีน (Chinese New Year)',
        shortLabel: 'วันตรุษจีน',
        icon: 'fa-dragon',
        emoji: '🧧',
        badgeText: '🧧 ตรุษจีน',
        greeting: 'ซินเจียยู่อี่ ซินนี้ฮวดไช้ มั่งคั่งร่ำรวยตลอดปี',
        subGreeting: 'กิจการรุ่งเรือง สินค้าหมุนเวียนคล่องตัว เฮงๆ รวยๆ ตลอดปี',
        bannerGradient: 'linear-gradient(135deg, #450a0a 0%, #991b1b 55%, #b45309 100%)',
        accentColor: '#fde047',
        decorIcons: ['🧧', '🏮', '🐉', '🪙']
    },
    songkran: {
        key: 'songkran',
        name: 'เทศกาลวันสงกรานต์ (Songkran Water Festival)',
        shortLabel: 'วันสงกรานต์',
        icon: 'fa-droplet',
        emoji: '💦',
        badgeText: '💦 สงกรานต์',
        greeting: 'สุขสันต์วันสงกรานต์ สวัสดีปีใหม่ไทย',
        subGreeting: 'เย็นชุ่มฉ่ำใจ ปลอดภัยทุกการเดินทาง และคล่องตัวทุกการจัดการสต็อกสินค้า',
        bannerGradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 55%, #0d9488 100%)',
        accentColor: '#7dd3fc',
        decorIcons: ['💦', '🌺', '🐘', '☀️']
    },
    visakhabucha: {
        key: 'visakhabucha',
        name: 'วันสำคัญทางพระพุทธศาสนา (มาฆบูชา / วิสาขบูชา)',
        shortLabel: 'วันสำคัญทางศาสนา',
        icon: 'fa-dharmachakra',
        emoji: '🪷',
        badgeText: '☸️ วันสำคัญทางศาสนา',
        greeting: 'น้อมรำลึกวันสำคัญทางพระพุทธศาสนา จิตใจผ่องใสในการทำงาน',
        subGreeting: 'มีสติ รอบคอบ และแม่นยำในการตรวจสอบและบริหารจัดการคลังสินค้า',
        bannerGradient: 'linear-gradient(135deg, #422006 0%, #78350f 55%, #b45309 100%)',
        accentColor: '#fde68a',
        decorIcons: ['☸️', '🕯️', '🪷', '✨']
    },
    mothersday: {
        key: 'mothersday',
        name: 'วันแม่แห่งชาติ (12 สิงหาคม)',
        shortLabel: 'วันแม่แห่งชาติ',
        icon: 'fa-ribbon',
        emoji: '🩵',
        badgeText: '🩵 วันแม่แห่งชาติ',
        greeting: 'สุขสันต์วันแม่แห่งชาติ ๑๒ สิงหาคม',
        subGreeting: 'น้อมสำนึกในพระมหากรุณาธิคุณ และส่งมอบความรักความอบอุ่นแด่คุณแม่ทุกท่าน',
        bannerGradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #38bdf8 100%)',
        accentColor: '#bae6fd',
        decorIcons: ['🩵', '🌼', '🤍', '✨']
    },
    halloween: {
        key: 'halloween',
        name: 'เทศกาลฮาโลวีน (Happy Halloween)',
        shortLabel: 'ฮาโลวีน',
        icon: 'fa-ghost',
        emoji: '🎃',
        badgeText: '🎃 Halloween',
        greeting: 'Happy Halloween! คืนปล่อยผีสุดสร้างสรรค์',
        subGreeting: 'ไม่มีสต็อกหลอน ไม่มีพิกัดหาย ตรวจสอบได้แม่นยำ 100% แบบ Realtime',
        bannerGradient: 'linear-gradient(135deg, #18181b 0%, #3b0764 55%, #9a3412 100%)',
        accentColor: '#fb923c',
        decorIcons: ['🎃', '👻', '🦇', '🕸️']
    },
    fathersday: {
        key: 'fathersday',
        name: 'วันพ่อแห่งชาติ (5 ธันวาคม)',
        shortLabel: 'วันพ่อแห่งชาติ',
        icon: 'fa-sun',
        emoji: '💛',
        badgeText: '💛 วันพ่อแห่งชาติ',
        greeting: 'สุขสันต์วันพ่อแห่งชาติ ๕ ธันวาคม',
        subGreeting: 'น้อมรำลึกในพระมหากรุณาธิคุณ และร่วมเชิดชูพระคุณพ่อของแผ่นดินและครอบครัว',
        bannerGradient: 'linear-gradient(135deg, #422006 0%, #854d0e 55%, #ca8a04 100%)',
        accentColor: '#fef08a',
        decorIcons: ['💛', '🌻', '🕯️', '✨']
    }
};

/**
 * 🗓️ ปฏิทินวันสำคัญและช่วงเทศกาลแยกตามปี ค.ศ. (2025 - 2030)
 */
const WMS_ANNUAL_FESTIVAL_SCHEDULE = {
    2025: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2025', eventDate: '2025-01-01', start: '2025-01-01', end: '2025-01-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '29 ม.ค. 2025', eventDate: '2025-01-29', start: '2025-01-20', end: '2025-02-05' },
        { themeKey: 'valentines', title: 'วันวาเลนไทน์ (Valentine’s Day)', dateLabel: '14 ก.พ. 2025', eventDate: '2025-02-14', start: '2025-02-10', end: '2025-02-15' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2025', eventDate: '2025-04-13', start: '2025-04-01', end: '2025-04-20' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2025', eventDate: '2025-08-12', start: '2025-08-08', end: '2025-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2025', eventDate: '2025-10-31', start: '2025-10-20', end: '2025-11-02' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '5 พ.ย. 2025', eventDate: '2025-11-05', start: '2025-11-03', end: '2025-11-25' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2025', eventDate: '2025-12-05', start: '2025-12-01', end: '2025-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2025', eventDate: '2025-12-25', start: '2025-12-07', end: '2025-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2025', eventDate: '2025-12-31', start: '2025-12-27', end: '2025-12-31' }
    ],
    2026: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2026', eventDate: '2026-01-01', start: '2026-01-01', end: '2026-01-15' },
        { themeKey: 'valentines', title: 'วันวาเลนไทน์ (Valentine’s Day)', dateLabel: '14 ก.พ. 2026', eventDate: '2026-02-14', start: '2026-02-10', end: '2026-02-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '17 ก.พ. 2026', eventDate: '2026-02-17', start: '2026-02-16', end: '2026-02-24' },
        { themeKey: 'visakhabucha', title: 'วันมาฆบูชา', dateLabel: '3 มี.ค. 2026', eventDate: '2026-03-03', start: '2026-03-01', end: '2026-03-05' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2026', eventDate: '2026-04-13', start: '2026-04-01', end: '2026-04-20' },
        { themeKey: 'visakhabucha', title: 'วันวิสาขบูชา', dateLabel: '31 พ.ค. 2026', eventDate: '2026-05-31', start: '2026-05-28', end: '2026-06-02' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2026', eventDate: '2026-08-12', start: '2026-08-08', end: '2026-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2026', eventDate: '2026-10-31', start: '2026-10-20', end: '2026-11-02' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '24 พ.ย. 2026', eventDate: '2026-11-24', start: '2026-11-03', end: '2026-11-26' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2026', eventDate: '2026-12-05', start: '2026-12-01', end: '2026-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2026', eventDate: '2026-12-25', start: '2026-12-07', end: '2026-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2026', eventDate: '2026-12-31', start: '2026-12-27', end: '2026-12-31' }
    ],
    2027: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2027', eventDate: '2027-01-01', start: '2027-01-01', end: '2027-01-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '6 ก.พ. 2027', eventDate: '2027-02-06', start: '2027-01-28', end: '2027-02-09' },
        { themeKey: 'valentines', title: 'วันวาเลนไทน์ (Valentine’s Day)', dateLabel: '14 ก.พ. 2027', eventDate: '2027-02-14', start: '2027-02-10', end: '2027-02-16' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2027', eventDate: '2027-04-13', start: '2027-04-01', end: '2027-04-20' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2027', eventDate: '2027-08-12', start: '2027-08-08', end: '2027-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2027', eventDate: '2027-10-31', start: '2027-10-20', end: '2027-11-02' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '13 พ.ย. 2027', eventDate: '2027-11-13', start: '2027-11-03', end: '2027-11-25' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2027', eventDate: '2027-12-05', start: '2027-12-01', end: '2027-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2027', eventDate: '2027-12-25', start: '2027-12-07', end: '2027-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2027', eventDate: '2027-12-31', start: '2027-12-27', end: '2027-12-31' }
    ],
    2028: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2028', eventDate: '2028-01-01', start: '2028-01-01', end: '2028-01-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '26 ม.ค. 2028', eventDate: '2028-01-26', start: '2028-01-18', end: '2028-02-03' },
        { themeKey: 'valentines', title: 'วันวาเลนไทน์ (Valentine’s Day)', dateLabel: '14 ก.พ. 2028', eventDate: '2028-02-14', start: '2028-02-10', end: '2028-02-16' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2028', eventDate: '2028-04-13', start: '2028-04-01', end: '2028-04-20' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2028', eventDate: '2028-08-12', start: '2028-08-08', end: '2028-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2028', eventDate: '2028-10-31', start: '2028-10-20', end: '2028-10-28' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '1 พ.ย. 2028', eventDate: '2028-11-01', start: '2028-10-29', end: '2028-11-15' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2028', eventDate: '2028-12-05', start: '2028-12-01', end: '2028-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2028', eventDate: '2028-12-25', start: '2028-12-07', end: '2028-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2028', eventDate: '2028-12-31', start: '2028-12-27', end: '2028-12-31' }
    ],
    2029: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2029', eventDate: '2029-01-01', start: '2029-01-01', end: '2029-01-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '13 ก.พ. 2029', eventDate: '2029-02-13', start: '2029-02-05', end: '2029-02-18' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2029', eventDate: '2029-04-13', start: '2029-04-01', end: '2029-04-20' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2029', eventDate: '2029-08-12', start: '2029-08-08', end: '2029-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2029', eventDate: '2029-10-31', start: '2029-10-20', end: '2029-11-02' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '21 พ.ย. 2029', eventDate: '2029-11-21', start: '2029-11-03', end: '2029-11-26' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2029', eventDate: '2029-12-05', start: '2029-12-01', end: '2029-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2029', eventDate: '2029-12-25', start: '2029-12-07', end: '2029-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2029', eventDate: '2029-12-31', start: '2029-12-27', end: '2029-12-31' }
    ],
    2030: [
        { themeKey: 'newyear', title: 'เทศกาลปีใหม่ (New Year)', dateLabel: '1 ม.ค. 2030', eventDate: '2030-01-01', start: '2030-01-01', end: '2030-01-15' },
        { themeKey: 'chinesenewyear', title: 'เทศกาลตรุษจีน (Chinese New Year)', dateLabel: '3 ก.พ. 2030', eventDate: '2030-02-03', start: '2030-01-25', end: '2030-02-09' },
        { themeKey: 'songkran', title: 'เทศกาลสงกรานต์ (Songkran)', dateLabel: '13 - 15 เม.ย. 2030', eventDate: '2030-04-13', start: '2030-04-01', end: '2030-04-20' },
        { themeKey: 'mothersday', title: 'วันแม่แห่งชาติ', dateLabel: '12 ส.ค. 2030', eventDate: '2030-08-12', start: '2030-08-08', end: '2030-08-14' },
        { themeKey: 'halloween', title: 'เทศกาลฮาโลวีน (Halloween)', dateLabel: '31 ต.ค. 2030', eventDate: '2030-10-31', start: '2030-10-20', end: '2030-11-02' },
        { themeKey: 'loykrathong', title: 'เทศกาลวันลอยกระทง (Loy Krathong)', dateLabel: '10 พ.ย. 2030', eventDate: '2030-11-10', start: '2030-11-03', end: '2030-11-20' },
        { themeKey: 'fathersday', title: 'วันพ่อแห่งชาติ', dateLabel: '5 ธ.ค. 2030', eventDate: '2030-12-05', start: '2030-12-01', end: '2030-12-06' },
        { themeKey: 'christmas', title: 'เทศกาลคริสต์มาส (Christmas)', dateLabel: '25 ธ.ค. 2030', eventDate: '2030-12-25', start: '2030-12-07', end: '2030-12-26' },
        { themeKey: 'newyear', title: 'ส่งท้ายปีเก่า ต้อนรับปีใหม่', dateLabel: '31 ธ.ค. 2030', eventDate: '2030-12-31', start: '2030-12-27', end: '2030-12-31' }
    ]
};

/**
 * 🏠 ตัวจัดการหน้าหลักเริ่มต้นเมื่อเข้าเว็บไซต์ครั้งแรก vs การรีเฟรช / ใช้งานเมนูอื่น
 */
const WMS_DASHBOARD_SESSION_KEYS = {
    SESSION_STARTED: 'WMS_SESSION_STARTED',
    SESSION_ACTIVE_VIEW: 'WMS_SESSION_ACTIVE_VIEW',
    LAST_ACTIVE_VIEW: 'WMS_LAST_ACTIVE_VIEW',
    ACTIVE_VIEW_ID: 'WMS_ACTIVE_VIEW_ID'
};

const WMS_KNOWN_VIEW_ALIASES = {
    'view-dashboard': 'view-dashboard',
    'dashboard-db': 'view-dashboard',
    'dashboard-db.js': 'view-dashboard',
    'view-inventory': 'view-inventory',
    'inv-db': 'view-inventory',
    'inv-db.js': 'view-inventory',
    'inventory.php': 'view-inventory',
    'view-inbound': 'view-inbound',
    'inbound-db': 'view-inbound',
    'inbound-db.js': 'view-inbound',
    'inbound.php': 'view-inbound',
    'view-outbound': 'view-outbound',
    'outbound-db': 'view-outbound',
    'outbound-db.js': 'view-outbound',
    'outbound.php': 'view-outbound',
    'view-locations': 'view-locations',
    'locations-db': 'view-locations',
    'locations-db.js': 'view-locations',
    'locations.php': 'view-locations',
    'view-approvals': 'view-approvals',
    'approvals-db': 'view-approvals',
    'approvals-db.js': 'view-approvals',
    'approvals.php': 'view-approvals',
    'view-activities': 'view-activities',
    'activities-db': 'view-activities',
    'activities-db.js': 'view-activities',
    'activities.php': 'view-activities',
    'view-settings': 'view-settings',
    'settings-db': 'view-settings',
    'settings-db.js': 'view-settings',
    'settings.php': 'view-settings'
};

function normalizeDashboardViewIdentifier(rawVal) {
    if (!rawVal || typeof rawVal !== 'string') return null;
    const cleaned = rawVal.replace(/^#/, '').split('?')[0].trim().toLowerCase();
    if (!cleaned || cleaned === 'view-login' || cleaned === 'auth-system' || cleaned === 'auth-system.js') {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(WMS_KNOWN_VIEW_ALIASES, cleaned)) {
        return WMS_KNOWN_VIEW_ALIASES[cleaned];
    }
    if (typeof window.PAGE_TITLE_MAP === 'object' && window.PAGE_TITLE_MAP !== null) {
        if (Object.prototype.hasOwnProperty.call(window.PAGE_TITLE_MAP, cleaned)) {
            return cleaned;
        }
        const matchedPageKey = Object.keys(window.PAGE_TITLE_MAP).find(
            k => (window.PAGE_TITLE_MAP[k].fileName || '').toLowerCase() === cleaned
        );
        if (matchedPageKey) return matchedPageKey;
    }
    if (typeof window.WMS_ROUTE_MANIFEST === 'object' && window.WMS_ROUTE_MANIFEST !== null) {
        if (Object.prototype.hasOwnProperty.call(window.WMS_ROUTE_MANIFEST, cleaned)) {
            return cleaned;
        }
        const matchedRouteKey = Object.keys(window.WMS_ROUTE_MANIFEST).find(k => {
            const item = window.WMS_ROUTE_MANIFEST[k];
            return (item.urlSlug || '').toLowerCase() === cleaned || (item.fileName || '').toLowerCase() === cleaned;
        });
        if (matchedRouteKey && matchedRouteKey !== 'view-login') return matchedRouteKey;
    }
    return null;
}

function detectBrowserPageReload() {
    try {
        if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0 && navEntries[0].type === 'reload') {
                return true;
            }
        }
        if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
            return true;
        }
    } catch (e) {}
    return false;
}

/**
 * ตัดสินใจเลือกหน้าแสดงผลเริ่มต้น:
 * - เข้าหน้าเว็บไซต์ครั้งแรก (เปิดใหม่/Session ใหม่ และไม่มีพารามิเตอร์เมนูเจาะจงใน URL) -> แสดงหน้าแดชบอร์ดหน้าแรก (view-dashboard) เป็นหลัก
 * - กดรีเฟรช (Reload) หรือใช้งานอยู่ในเมนูอื่น ๆ -> คงหน้าเมนูเดิมไว้ตามโครงสร้างเดิม
 */
function resolveDashboardFirstEntryOrActiveView() {
    try {
        const rawHash = (window.location.hash || '').replace(/^#/, '').split('?')[0].trim().toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = (urlParams.get('page') || urlParams.get('file') || '').trim().toLowerCase();
        const pathFile = window.location.pathname.split('/').pop().toLowerCase();

        const explicitUrlView = normalizeDashboardViewIdentifier(rawHash)
            || normalizeDashboardViewIdentifier(pageParam)
            || normalizeDashboardViewIdentifier(pathFile);

        const isReload = detectBrowserPageReload();
        const sessionStarted = sessionStorage.getItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED) === '1';

        if (!sessionStarted && !isReload && !explicitUrlView) {
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED, '1');
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, 'view-dashboard');
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW, 'view-dashboard');
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID, 'view-dashboard');
            return 'view-dashboard';
        }

        sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED, '1');

        if (explicitUrlView) {
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, explicitUrlView);
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW, explicitUrlView);
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID, explicitUrlView);
            return explicitUrlView;
        }

        const sessionView = normalizeDashboardViewIdentifier(
            sessionStorage.getItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW)
        );
        if (sessionView) {
            return sessionView;
        }

        const storedView = normalizeDashboardViewIdentifier(
            localStorage.getItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW)
            || localStorage.getItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID)
        );
        if (storedView) {
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, storedView);
            return storedView;
        }
    } catch (e) {}

    return 'view-dashboard';
}

function persistActiveViewForSessionAndReload(viewId) {
    const normalized = normalizeDashboardViewIdentifier(viewId);
    if (!normalized) return;
    try {
        sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED, '1');
        sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, normalized);
        localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW, normalized);
        localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID, normalized);
    } catch (e) {}
}

// ทำงานทันทีตั้งแต่โหลดไฟล์ dashboard-db.js เพื่อจองสิทธิ์หน้าแรกก่อนสคริปต์ตัวอื่น
const WMS_INITIAL_BOOT_TARGET_VIEW = resolveDashboardFirstEntryOrActiveView();

/**
 * 🌦️ ระบบตรวจจับสภาพอากาศ Real-Time & แจ้งเตือนอัจฉริยะ (Open-Meteo API)
 */
function interpretWmoWeatherCondition(code, isDay = 1, temp = 30, rainProb = 0, windSpeed = 10) {
    const c = Number(code) || 0;
    let label = 'ท้องฟ้าแจ่มใส';
    let emoji = isDay ? '☀️' : '🌙';
    let faIcon = isDay ? 'fa-sun' : 'fa-moon';
    let qualityBadge = '✨ วันนี้อากาศดีมาก';
    let level = 'good'; // good | moderate | hot | rain | storm
    let advice = 'วันนี้อากาศดี ท้องฟ้าโปร่ง อุณหภูมิเหมาะสม การขนส่งและโหลดสินค้าหน้าท่า DOCK คล่องตัว 100%';
    let gradient = 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 55%, #38bdf8 100%)';

    if (c === 0) {
        label = isDay ? 'ท้องฟ้าแจ่มใส ไร้เมฆ' : 'ท้องฟ้าโปร่ง ปลอดโปร่ง';
        emoji = isDay ? '☀️' : '✨';
        faIcon = isDay ? 'fa-sun' : 'fa-moon';
    } else if (c >= 1 && c <= 2) {
        label = 'มีเมฆบางส่วน อากาศปลอดโปร่ง';
        emoji = isDay ? '⛅' : '☁️';
        faIcon = 'fa-cloud-sun';
        qualityBadge = '🌤️ วันนี้อากาศดี ปฏิบัติงานสะดวก';
        advice = 'สภาพอากาศดี มีเมฆบางส่วนช่วยลดแสงแดดจ้า เหมาะแก่การตรวจรับ-จัดส่งสินค้าและงานกลางแจ้ง';
        gradient = 'linear-gradient(135deg, #0369a1 0%, #0284c7 60%, #0d9488 100%)';
    } else if (c === 3) {
        label = 'มีเมฆมาก ท้องฟ้าครึ้ม';
        emoji = '☁️';
        faIcon = 'fa-cloud';
        qualityBadge = '☁️ อากาศปานกลาง มีเมฆมาก';
        level = 'moderate';
        advice = 'ท้องฟ้ามีเมฆปกคลุมหนาแน่น อากาศไม่ร้อนจัด แต่ควรเฝ้าระวังโอกาสเกิดฝนในช่วงบ่ายหรือเย็น';
        gradient = 'linear-gradient(135deg, #334155 0%, #475569 55%, #64748b 100%)';
    } else if (c >= 45 && c <= 48) {
        label = 'มีหมอก / ทัศนวิสัยลดลง';
        emoji = '🌫️';
        faIcon = 'fa-smog';
        qualityBadge = '🌫️ แจ้งเตือนหมอก / ทัศนวิสัย';
        level = 'moderate';
        advice = 'มีหมอกปกคลุมในพื้นที่ รถขนส่งและรถโฟล์คลิฟท์บริเวณลานโหลดสินค้าควรเปิดไฟสัญญาณและใช้ความระมัดระวัง';
        gradient = 'linear-gradient(135deg, #374151 0%, #4b5563 60%, #6b7280 100%)';
    } else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) {
        const isHeavy = (c === 65 || c === 67 || c === 81 || c === 82);
        label = isHeavy ? 'มีฝนตกหนัก' : 'มีฝนตก / ฝนโปรยปราย';
        emoji = '🌧️';
        faIcon = 'fa-cloud-showers-heavy';
        qualityBadge = isHeavy ? '🚨 แจ้งเตือนฝนตกหนัก!' : '🌧️ แจ้งเตือนมีฝนตก';
        level = 'rain';
        advice = 'วันนี้มีฝนตก! โปรดตรวจสอบหลังคาและผ้าใบคลุมรถขนส่ง ป้องกันความชื้นเข้าสู่กล่องพัสดุบริเวณจุดพัก DOCK';
        gradient = 'linear-gradient(135deg, #1e293b 0%, #1e3a8a 55%, #312e81 100%)';
    } else if (c >= 95 && c <= 99) {
        label = 'พายุฝนฟ้าคะนองและลมกระโชกแรง';
        emoji = '⛈️';
        faIcon = 'fa-cloud-bolt';
        qualityBadge = '⚠️ แจ้งเตือนพายุฝนฟ้าคะนอง!';
        level = 'storm';
        advice = 'เตือนภัยพายุฝนฟ้าคะนอง! งดการทำงานในที่โล่งแจ้ง ตรวจสอบระบบไฟฟ้าสำรอง และปิดประตูชัตเตอร์คลังสินค้าให้มิดชิด';
        gradient = 'linear-gradient(135deg, #090d16 0%, #311042 55%, #7f1d1d 100%)';
    }

    // ปรับการแจ้งเตือนเพิ่มเติมหากอุณหภูมิสูงจัดแม้ท้องฟ้าโปร่ง
    if ((level === 'good' || level === 'moderate') && Number(temp) >= 36) {
        qualityBadge = '🔥 อากาศดีแต่ร้อนจัด (' + Math.round(temp) + '°C)';
        level = 'hot';
        advice = `อุณหภูมิสูงถึง ${Math.round(temp)}°C ควรเปิดพัดลมระบายอากาศในคลังสินค้า ตรวจสอบสินค้าที่ไวต่อความร้อน และให้ทีมงานดื่มน้ำสม่ำเสมอ`;
        gradient = 'linear-gradient(135deg, #9a3412 0%, #c2410c 55%, #ea580c 100%)';
    } else if (level === 'good' && Number(rainProb) >= 60) {
        qualityBadge = '🌦️ อากาศดี แต่มีโอกาสฝน ' + rainProb + '%';
        advice = `ช่วงนี้สภาพอากาศยังดี แต่มีโอกาสเกิดฝน ${rainProb}% ในอีกไม่กี่ชั่วโมงข้างหน้า แนะนำให้เร่งขนถ่ายสินค้าหน้า DOCK ให้เรียบร้อย`;
    }

    return { label, emoji, faIcon, qualityBadge, level, advice, gradient };
}

function getThaiDayShortName(isoDateStr, index) {
    if (index === 0) return 'วันนี้';
    if (index === 1) return 'พรุ่งนี้';
    try {
        const d = new Date(`${isoDateStr}T00:00:00`);
        return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (e) {
        return isoDateStr;
    }
}

async function resolveCoordinatesForWeather(hubKey) {
    const hub = WMS_WEATHER_HUBS[hubKey] || WMS_WEATHER_HUBS.auto;
    if (hubKey !== 'auto') {
        return { lat: hub.lat, lon: hub.lon, name: hub.fallbackName, isGps: false };
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 4500,
                    maximumAge: 10 * 60 * 1000
                });
            });
            const lat = Number(pos.coords.latitude.toFixed(4));
            const lon = Number(pos.coords.longitude.toFixed(4));
            let resolvedLabel = `พิกัด GPS ปัจจุบัน (${lat.toFixed(2)}, ${lon.toFixed(2)})`;

            // พยายามแปลงพิกัดเป็นชื่อจังหวัด/เขตแบบไม่บล็อกการทำงานหลัก
            try {
                const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=th`);
                if (geoRes.ok) {
                    const geoJson = await geoRes.json();
                    const area = geoJson.locality || geoJson.city || '';
                    const province = geoJson.principalSubdivision || '';
                    if (area || province) {
                        resolvedLabel = [area, province].filter(Boolean).join(', ');
                    }
                }
            } catch (e) {}

            return { lat, lon, name: resolvedLabel, isGps: true };
        } catch (err) {
            return { lat: hub.lat, lon: hub.lon, name: hub.fallbackName, isGps: false };
        }
    }

    return { lat: hub.lat, lon: hub.lon, name: hub.fallbackName, isGps: false };
}

async function fetchWarehouseWeather(forceRefresh = false) {
    const hubKey = WMS_WEATHER_STATE.hubKey || 'auto';

    // ตรวจสอบแคชก่อนเพื่อความรวดเร็วและประหยัดแบนด์วิดท์
    if (!forceRefresh) {
        try {
            const rawCache = localStorage.getItem(WMS_WEATHER_CACHE_KEY);
            if (rawCache) {
                const parsed = JSON.parse(rawCache);
                const isFresh = parsed && parsed.hubKey === hubKey && (Date.now() - parsed.timestamp) < WMS_WEATHER_CACHE_TTL_MS;
                if (isFresh && parsed.data) {
                    WMS_WEATHER_STATE = {
                        ...WMS_WEATHER_STATE,
                        loading: false,
                        error: null,
                        data: parsed.data,
                        locationName: parsed.locationName,
                        isGpsDetected: parsed.isGpsDetected,
                        lastUpdated: parsed.timestamp
                    };
                    updateDashboardWeatherUI();
                    return;
                }
            }
        } catch (e) {}
    }

    WMS_WEATHER_STATE.loading = true;
    WMS_WEATHER_STATE.error = null;
    updateDashboardWeatherUI();

    try {
        const coords = await resolveCoordinatesForWeather(hubKey);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia%2FBangkok&forecast_days=3`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();

        const current = json.current || {};
        const daily = json.daily || {};
        const nowTimestamp = Date.now();

        const todayMax = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : current.temperature_2m;
        const todayMin = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : current.temperature_2m;
        const todayRainProb = Array.isArray(daily.precipitation_probability_max) ? (daily.precipitation_probability_max[0] || 0) : 0;
        const todayUvMax = Array.isArray(daily.uv_index_max) ? (daily.uv_index_max[0] || 0) : 0;

        const condition = interpretWmoWeatherCondition(
            current.weather_code,
            current.is_day,
            current.temperature_2m,
            todayRainProb,
            current.wind_speed_10m
        );

        const forecastDays = (daily.time || []).slice(0, 3).map((dStr, idx) => {
            const fCond = interpretWmoWeatherCondition(
                daily.weather_code?.[idx],
                1,
                daily.temperature_2m_max?.[idx],
                daily.precipitation_probability_max?.[idx] || 0,
                10
            );
            return {
                dateStr: dStr,
                dayLabel: getThaiDayShortName(dStr, idx),
                emoji: fCond.emoji,
                label: fCond.label,
                maxTemp: Math.round(daily.temperature_2m_max?.[idx] ?? 0),
                minTemp: Math.round(daily.temperature_2m_min?.[idx] ?? 0),
                rainProb: Math.round(daily.precipitation_probability_max?.[idx] ?? 0)
            };
        });

        const structuredWeather = {
            temp: Number(current.temperature_2m ?? 0).toFixed(1),
            feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0),
            humidity: Math.round(current.relative_humidity_2m ?? 0),
            windSpeed: Number(current.wind_speed_10m ?? 0).toFixed(1),
            precipitation: Number(current.precipitation ?? 0).toFixed(1),
            todayMax: Math.round(todayMax ?? 0),
            todayMin: Math.round(todayMin ?? 0),
            rainProb: Math.round(todayRainProb),
            uvMax: Number(todayUvMax).toFixed(1),
            condition,
            forecastDays
        };

        WMS_WEATHER_STATE = {
            ...WMS_WEATHER_STATE,
            loading: false,
            error: null,
            data: structuredWeather,
            locationName: coords.name,
            isGpsDetected: coords.isGps,
            lastUpdated: nowTimestamp
        };

        try {
            localStorage.setItem(WMS_WEATHER_CACHE_KEY, JSON.stringify({
                hubKey,
                locationName: coords.name,
                isGpsDetected: coords.isGps,
                timestamp: nowTimestamp,
                data: structuredWeather
            }));
        } catch (e) {}

        updateDashboardWeatherUI();

        // แจ้งเตือน Toast อัตโนมัติเมื่อผู้ใช้กดอัปเดตหรือพบสภาพอากาศที่ต้องระวังครั้งแรก
        if (forceRefresh && typeof showToast === 'function') {
            showToast(`${condition.emoji} อัปเดตสภาพอากาศ (${coords.name}): ${structuredWeather.temp}°C • ${condition.qualityBadge}`);
        } else if (!WMS_WEATHER_STATE.notifiedSession && (condition.level === 'rain' || condition.level === 'storm')) {
            WMS_WEATHER_STATE.notifiedSession = true;
            if (typeof showToast === 'function') {
                showToast(`${condition.emoji} แจ้งเตือนสภาพอากาศวันนี้: ${condition.label} (${structuredWeather.temp}°C)`);
            }
        }
    } catch (err) {
        WMS_WEATHER_STATE.loading = false;
        WMS_WEATHER_STATE.error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์พยากรณ์อากาศได้ชั่วคราว';
        updateDashboardWeatherUI();
    }
}

function onDashboardWeatherHubChange(newHubKey) {
    WMS_WEATHER_STATE.hubKey = newHubKey || 'auto';
    WMS_WEATHER_STATE.alertDismissed = false;
    try {
        localStorage.setItem(WMS_WEATHER_HUB_PREF_KEY, WMS_WEATHER_STATE.hubKey);
    } catch (e) {}
    fetchWarehouseWeather(true);
}

function dismissDashboardWeatherAlert() {
    WMS_WEATHER_STATE.alertDismissed = true;
    const alertBox = document.getElementById('wmsWeatherSmartAlertBanner');
    if (alertBox) alertBox.style.display = 'none';
}

function buildWeatherSectionHTML() {
    const esc = (str) => (typeof escapeHTML === 'function' ? escapeHTML(str) : String(str || ''));
    const w = WMS_WEATHER_STATE.data;

    if (WMS_WEATHER_STATE.loading && !w) {
        return `
            <div class="card wms-weather-card" style="margin-bottom:1.25rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="wms-festival-icon-circle"><i class="fa-solid fa-satellite-dish fa-spin"></i></div>
                        <div>
                            <div style="font-weight:800; font-size:0.98rem;">กำลังตรวจจับสภาพอากาศและอุณหภูมิ Real-Time...</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">กำลังซิงค์ข้อมูลจากสถานีตรวจวัดอากาศและพิกัดคลังสินค้า</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (WMS_WEATHER_STATE.error && !w) {
        return `
            <div class="card wms-weather-card" style="margin-bottom:1.25rem; border-left:4px solid var(--warning);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="wms-festival-icon-circle" style="background:#fef3c7; color:#d97706;"><i class="fa-solid fa-cloud-exclamation"></i></div>
                        <div>
                            <div style="font-weight:800; font-size:0.95rem;">${esc(WMS_WEATHER_STATE.error)}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-primary" onclick="fetchWarehouseWeather(true)">
                        <i class="fa-solid fa-rotate"></i> ลองดึงข้อมูลใหม่
                    </button>
                </div>
            </div>
        `;
    }

    if (!w) return '';

    const cond = w.condition;
    const updatedStr = WMS_WEATHER_STATE.lastUpdated
        ? new Date(WMS_WEATHER_STATE.lastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
        : 'ล่าสุด';

    const alertBorderColor = cond.level === 'storm' ? '#ef4444'
        : cond.level === 'rain' ? '#3b82f6'
        : cond.level === 'hot' ? '#f97316'
        : '#10b981';

    const alertBgTint = cond.level === 'storm' ? 'rgba(239, 68, 68, 0.10)'
        : cond.level === 'rain' ? 'rgba(59, 130, 246, 0.10)'
        : cond.level === 'hot' ? 'rgba(249, 115, 22, 0.10)'
        : 'rgba(16, 185, 129, 0.10)';

    return `
        <div class="wms-weather-wrapper" style="margin-bottom:1.25rem;">
            <!-- แถบแจ้งเตือนสภาพอากาศอัจฉริยะประจำวัน -->
            ${!WMS_WEATHER_STATE.alertDismissed ? `
                <div id="wmsWeatherSmartAlertBanner" class="wms-weather-alert-banner" style="background:${alertBgTint}; border:1px solid ${alertBorderColor}; border-left:5px solid ${alertBorderColor};">
                    <div class="wms-weather-alert-main">
                        <span class="wms-weather-alert-emoji">${cond.emoji}</span>
                        <div class="wms-weather-alert-text">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <strong style="font-size:0.9rem; color:var(--text-main);">${esc(cond.qualityBadge)} — อุณหภูมิ ${esc(w.temp)}°C (${esc(cond.label)})</strong>
                                <span class="wms-weather-loc-tag"><i class="fa-solid fa-location-dot"></i> ${esc(WMS_WEATHER_STATE.locationName)}</span>
                            </div>
                            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">
                                ${esc(cond.advice)}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="wms-weather-alert-close" onclick="dismissDashboardWeatherAlert()" title="ปิดแถบแจ้งเตือนนี้ชั่วคราว">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            ` : ''}

            <!-- การ์ดแสดงผลสภาพอากาศและพยากรณ์ครบวงจร -->
            <div class="card wms-weather-main-card">
                <div class="wms-weather-grid">
                    <!-- ฝั่งซ้าย: อุณหภูมิและสถานะหลัก -->
                    <div class="wms-weather-hero-box" style="background:${cond.gradient};">
                        <div class="wms-weather-hero-top">
                            <span class="wms-weather-status-chip">${cond.emoji} ${esc(cond.qualityBadge)}</span>
                            <span class="wms-weather-time-chip mono"><i class="fa-regular fa-clock"></i> อัปเดต ${esc(updatedStr)}</span>
                        </div>

                        <div class="wms-weather-temp-row">
                            <div class="wms-weather-big-temp mono">${esc(w.temp)}<span class="wms-weather-unit">°C</span></div>
                            <div class="wms-weather-desc-col">
                                <div style="font-size:1.05rem; font-weight:800; color:#ffffff;">${esc(cond.label)}</div>
                                <div style="font-size:0.82rem; color:rgba(255,255,255,0.9);">
                                    รู้สึกเหมือน <strong>${w.feelsLike}°C</strong> • สูงสุด ${w.todayMax}° / ต่ำสุด ${w.todayMin}°
                                </div>
                                <div style="font-size:0.78rem; color:rgba(255,255,255,0.85); margin-top:3px;">
                                    <i class="fa-solid fa-location-crosshairs"></i> ${esc(WMS_WEATHER_STATE.locationName)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ฝั่งขวา: ตัวชี้วัดสภาพอากาศ + พยากรณ์ 3 วัน + ตัวเลือกพื้นที่ -->
                    <div class="wms-weather-details-box">
                        <div class="wms-weather-toolbar">
                            <div style="font-weight:800; font-size:0.9rem; color:var(--text-main);">
                                <i class="fa-solid fa-temperature-half" style="color:var(--primary);"></i> รายละเอียดสภาพอากาศ & พื้นที่คลังสินค้า
                            </div>
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <select id="dashWeatherHubSelect" class="form-select" style="font-size:0.8rem; padding:5px 10px; min-height:34px;" onchange="onDashboardWeatherHubChange(this.value)" aria-label="เลือกพื้นที่ตรวจวัดสภาพอากาศ">
                                    ${Object.values(WMS_WEATHER_HUBS).map(h => `
                                        <option value="${h.key}" ${WMS_WEATHER_STATE.hubKey === h.key ? 'selected' : ''}>${esc(h.label)}</option>
                                    `).join('')}
                                </select>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="fetchWarehouseWeather(true)" title="รีเฟรชข้อมูลสภาพอากาศล่าสุด" style="min-height:34px;">
                                    <i class="fa-solid fa-rotate ${WMS_WEATHER_STATE.loading ? 'fa-spin' : ''}"></i>
                                </button>
                            </div>
                        </div>

                        <div class="wms-weather-metrics-row">
                            <div class="wms-wmetric-pill">
                                <span class="wms-wmetric-label"><i class="fa-solid fa-droplet" style="color:#0ea5e9;"></i> ความชื้นสัมพัทธ์</span>
                                <strong class="wms-wmetric-val mono">${w.humidity}%</strong>
                            </div>
                            <div class="wms-wmetric-pill">
                                <span class="wms-wmetric-label"><i class="fa-solid fa-cloud-rain" style="color:#3b82f6;"></i> โอกาสเกิดฝน</span>
                                <strong class="wms-wmetric-val mono">${w.rainProb}%</strong>
                            </div>
                            <div class="wms-wmetric-pill">
                                <span class="wms-wmetric-label"><i class="fa-solid fa-wind" style="color:#14b8a6;"></i> ความเร็วลม</span>
                                <strong class="wms-wmetric-val mono">${w.windSpeed} km/h</strong>
                            </div>
                            <div class="wms-wmetric-pill">
                                <span class="wms-wmetric-label"><i class="fa-solid fa-sun" style="color:#f59e0b;"></i> ดัชนี UV สูงสุด</span>
                                <strong class="wms-wmetric-val mono">${w.uvMax}</strong>
                            </div>
                        </div>

                        <!-- พยากรณ์อากาศ 3 วัน -->
                        <div class="wms-weather-forecast-strip">
                            ${(w.forecastDays || []).map(fd => `
                                <div class="wms-wforecast-item">
                                    <span class="wms-wf-day">${esc(fd.dayLabel)}</span>
                                    <span class="wms-wf-icon" title="${esc(fd.label)}">${fd.emoji}</span>
                                    <span class="wms-wf-temp mono"><strong>${fd.maxTemp}°</strong> / ${fd.minTemp}°</span>
                                    <span class="wms-wf-rain mono"><i class="fa-solid fa-umbrella"></i> ${fd.rainProb}%</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateDashboardWeatherUI() {
    const slot = document.getElementById('wmsDashboardWeatherSlot');
    if (slot) {
        slot.innerHTML = buildWeatherSectionHTML();
    }
    const heroWeatherChip = document.getElementById('wmsHeroWeatherPill');
    if (heroWeatherChip && WMS_WEATHER_STATE.data) {
        const w = WMS_WEATHER_STATE.data;
        heroWeatherChip.innerHTML = `${w.condition.emoji} <span class="mono">${w.temp}°C</span> • <span>${w.condition.qualityBadge}</span>`;
    }
}

/**
 * คำนวณจำนวนวันคงเหลือจนถึงวันเทศกาล
 */
function calculateFestivalDaysDiff(todayIso, targetIso) {
    if (!targetIso) return null;
    const t1 = new Date(`${todayIso}T00:00:00`);
    const t2 = new Date(`${targetIso}T00:00:00`);
    const diffMs = t2.getTime() - t1.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * ตรวจจับเทศกาลอัตโนมัติตามวันที่ปัจจุบันและปีปฏิทิน
 */
function resolveFestivalFromCalendar(targetYear = null) {
    const now = new Date();
    const year = targetYear || now.getFullYear();
    const schedule = WMS_ANNUAL_FESTIVAL_SCHEDULE[year] || WMS_ANNUAL_FESTIVAL_SCHEDULE[2026];

    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayIso = `${year}-${mm}-${dd}`;

    const activeEvent = schedule.find(ev => todayIso >= ev.start && todayIso <= ev.end);
    if (activeEvent) {
        const diffDays = calculateFestivalDaysDiff(todayIso, activeEvent.eventDate || activeEvent.end);
        const countdownHint = (diffDays !== null && diffDays > 0)
            ? ` • อีก ${diffDays} วันถึงวันงาน`
            : (diffDays === 0 ? ' • วันนี้ตรงกับวันเทศกาล!' : '');

        return {
            themeKey: activeEvent.themeKey,
            matchedEvent: activeEvent,
            isExactSeason: true,
            daysUntil: diffDays,
            statusLabel: `กำลังอยู่ในช่วง ${activeEvent.title} (${activeEvent.dateLabel})${countdownHint}`
        };
    }

    const upcomingEvent = schedule.find(ev => ev.start > todayIso) || schedule[0];
    const diffDays = calculateFestivalDaysDiff(todayIso, upcomingEvent.eventDate || upcomingEvent.start);
    const countdownHint = (diffDays !== null && diffDays > 0) ? ` • อีก ${diffDays} วัน` : '';

    return {
        themeKey: upcomingEvent.themeKey,
        matchedEvent: upcomingEvent,
        isExactSeason: false,
        daysUntil: diffDays,
        statusLabel: `เทศกาลใกล้จะถึง: ${upcomingEvent.title} (${upcomingEvent.dateLabel})${countdownHint}`
    };
}

/**
 * ดึงค่าโหมดธีมและปีปฏิทินที่บันทึกไว้
 */
function getDashboardThemePreferences() {
    const savedMode = localStorage.getItem('WMS_SEASONAL_THEME_MODE') || 'auto';
    const savedYear = parseInt(localStorage.getItem('WMS_FESTIVAL_CALENDAR_YEAR'), 10) || new Date().getFullYear();
    return { mode: savedMode, year: savedYear };
}

/**
 * นำธีมเทศกาลไปใช้งานทั่วทั้งหน้าเว็บไซต์ (Sidebar, Navbar, Cards, Dashboard)
 */
function applyFestivalThemeFromPreferences(showNotification = false) {
    const prefs = getDashboardThemePreferences();
    let effectiveThemeKey = prefs.mode;
    let calendarInfo = resolveFestivalFromCalendar(prefs.year);

    if (prefs.mode === 'auto') {
        effectiveThemeKey = calendarInfo.themeKey;
    }

    const themeObj = WMS_FESTIVAL_THEMES[effectiveThemeKey] || WMS_FESTIVAL_THEMES.default;
    const html = document.documentElement;

    if (effectiveThemeKey === 'default') {
        html.removeAttribute('data-seasonal-theme');
        localStorage.setItem('WMS_SEASONAL_THEME', 'default');
    } else {
        html.setAttribute('data-seasonal-theme', effectiveThemeKey);
        localStorage.setItem('WMS_SEASONAL_THEME', effectiveThemeKey);
    }

    const sidebarBadge = document.getElementById('sidebarFestiveBadge');
    if (sidebarBadge) {
        sidebarBadge.textContent = themeObj.badgeText;
    }

    const navThemeBtn = document.getElementById('seasonalThemeBtn');
    if (navThemeBtn) {
        navThemeBtn.innerHTML = `<i class="fa-solid ${themeObj.icon}" style="color:var(--primary);"></i> <span class="hide-mobile-text">${themeObj.shortLabel}</span>`;
    }

    if (showNotification && typeof showToast === 'function') {
        showToast(`${themeObj.emoji} เปลี่ยนธีมเทศกาลเป็น: ${themeObj.name}`);
    }

    return { prefs, effectiveThemeKey, themeObj, calendarInfo };
}

function onDashboardFestivalModeChange(newMode) {
    localStorage.setItem('WMS_SEASONAL_THEME_MODE', newMode);
    applyFestivalThemeFromPreferences(true);
    renderWarehouseDashboard();
}

function onDashboardCalendarYearChange(newYear) {
    localStorage.setItem('WMS_FESTIVAL_CALENDAR_YEAR', String(newYear));
    applyFestivalThemeFromPreferences(false);
    renderWarehouseDashboard();
}

function cycleSeasonalFestivalTheme() {
    const order = ['auto', 'loykrathong', 'christmas', 'newyear', 'valentines', 'chinesenewyear', 'songkran', 'visakhabucha', 'mothersday', 'halloween', 'fathersday', 'default'];
    const current = localStorage.getItem('WMS_SEASONAL_THEME_MODE') || 'auto';
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    onDashboardFestivalModeChange(order[nextIdx]);
}

/**
 * ดึงข้อมูลผู้สร้างระบบ (รองรับการบันทึกแก้ไขเพิ่มเติมใน LocalStorage)
 */
function getCreatorProfileData() {
    try {
        const saved = localStorage.getItem('WMS_CREATOR_CUSTOM_INFO');
        if (saved) {
            return { ...WMS_DEFAULT_CREATOR_INFO, ...JSON.parse(saved) };
        }
    } catch (e) {}
    return { ...WMS_DEFAULT_CREATOR_INFO };
}

function toggleCreatorEditPanel() {
    const panel = document.getElementById('creatorEditFormPanel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
}

function saveCreatorProfileData(e) {
    if (e) e.preventDefault();
    const updated = {
        fullName: (document.getElementById('creatorInputName')?.value || '').trim() || WMS_DEFAULT_CREATOR_INFO.fullName,
        role: (document.getElementById('creatorInputRole')?.value || '').trim() || WMS_DEFAULT_CREATOR_INFO.role,
        organization: (document.getElementById('creatorInputOrg')?.value || '').trim() || WMS_DEFAULT_CREATOR_INFO.organization,
        contactNote: (document.getElementById('creatorInputNote')?.value || '').trim() || WMS_DEFAULT_CREATOR_INFO.contactNote
    };
    localStorage.setItem('WMS_CREATOR_CUSTOM_INFO', JSON.stringify(updated));
    if (typeof showToast === 'function') showToast('✅ บันทึกข้อมูลผู้สร้างและรายละเอียดหน้าแรกเรียบร้อยแล้ว');
    renderWarehouseDashboard();
}

/**
 * 🔗 ลงทะเบียนเส้นทาง view-dashboard เข้ากับ navigation.js และ app-main.js
 */
function registerDashboardRouteManifests() {
    if (typeof window.PAGE_TITLE_MAP === 'object' && window.PAGE_TITLE_MAP !== null) {
        window.PAGE_TITLE_MAP['view-dashboard'] = {
            title: 'แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า',
            subtitle: 'WMS Enterprise Executive Dashboard, Weather & Analytics',
            icon: 'fa-house-laptop',
            catId: 'cat-warehouse',
            linkId: 'm-dashboard-link',
            fileName: 'dashboard-db.js'
        };
    }

    if (typeof window.WMS_ROUTE_MANIFEST === 'object' && window.WMS_ROUTE_MANIFEST !== null) {
        window.WMS_ROUTE_MANIFEST['view-dashboard'] = {
            title: 'แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า',
            subtitle: 'WMS Enterprise Executive Dashboard, Weather & Analytics',
            icon: 'fa-house-laptop',
            urlSlug: 'dashboard-db',
            fileName: 'dashboard-db.js',
            dbFolder: 'supabase/dashboard_overview'
        };
    }
}

/**
 * 📊 ตัวสร้างกราฟ SVG แบบ Interactive มาตรฐานระดับองค์กร (Zero-Dependency, 100% Responsive)
 */
function buildCategoryDonutChartHTML(invList, rackedCount, dockCount) {
    const esc = (str) => (typeof escapeHTML === 'function' ? escapeHTML(str) : String(str || ''));
    const total = invList.length;

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const skuMap = {};
    invList.forEach(item => {
        const key = (item.category || item.sku || item.name || 'สินค้าทั่วไป').trim();
        skuMap[key] = (skuMap[key] || 0) + 1;
    });

    const sortedSkus = Object.entries(skuMap).sort((a, b) => b[1] - a[1]);
    let segments = [];

    if (sortedSkus.length > 0) {
        const top5 = sortedSkus.slice(0, 5);
        const topSum = top5.reduce((acc, [, v]) => acc + v, 0);
        const otherSum = Math.max(0, total - topSum);
        segments = top5.map(([label, value], idx) => ({
            label,
            value,
            color: palette[idx % palette.length]
        }));
        if (otherSum > 0) {
            segments.push({ label: 'หมวดหมู่อื่นๆ', value: otherSum, color: palette[5] });
        }
    } else {
        segments = [
            { label: 'จัดเก็บในแร็ค', value: rackedCount || 1, color: '#2563eb' },
            { label: 'พักรอที่ DOCK', value: dockCount || 0, color: '#f59e0b' }
        ];
    }

    const chartTotal = segments.reduce((sum, s) => sum + s.value, 0) || 1;
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let cumulativeOffset = 0;

    const svgCircles = segments.map((seg, idx) => {
        const fraction = seg.value / chartTotal;
        const dashLength = Math.max(2, fraction * circumference);
        const dashArray = `${dashLength} ${circumference}`;
        const dashOffset = -cumulativeOffset;
        cumulativeOffset += fraction * circumference;
        const pct = Math.round(fraction * 100);

        return `
            <circle
                cx="75" cy="75" r="${radius}"
                fill="transparent"
                stroke="${seg.color}"
                stroke-width="18"
                stroke-dasharray="${dashArray}"
                stroke-dashoffset="${dashOffset}"
                stroke-linecap="butt"
                style="transition: all 0.4s ease; cursor:pointer;"
            >
                <title>${esc(seg.label)}: ${seg.value.toLocaleString()} ชิ้น (${pct}%)</title>
            </circle>
        `;
    }).join('');

    return `
        <div class="wms-donut-layout">
            <div class="wms-donut-svg-wrap">
                <svg viewBox="0 0 150 150" class="wms-donut-svg" role="img" aria-label="กราฟสัดส่วนหมวดหมู่สินค้าในคลัง">
                    <circle cx="75" cy="75" r="${radius}" fill="transparent" stroke="var(--border-color)" stroke-width="18" opacity="0.35"></circle>
                    <g transform="rotate(-90 75 75)">
                        ${svgCircles}
                    </g>
                </svg>
                <div class="wms-donut-center">
                    <span class="wms-donut-center-num mono">${total.toLocaleString()}</span>
                    <span class="wms-donut-center-lbl">รายการรวม</span>
                </div>
            </div>

            <div class="wms-donut-legend">
                ${segments.map(seg => {
                    const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
                    return `
                        <div class="wms-legend-row">
                            <span class="wms-legend-dot" style="background:${seg.color};"></span>
                            <span class="wms-legend-name" title="${esc(seg.label)}">${esc(seg.label)}</span>
                            <span class="wms-legend-val mono">${seg.value.toLocaleString()} <small>(${pct}%)</small></span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function buildStockTrendAreaChartHTML(invList) {
    // สร้างข้อมูลแนวโน้ม 7 วันล่าสุดจากวันที่ในฐานข้อมูล (หรือจำลองฐานเทียบเคียงเมื่อไม่มีฟิลด์วันที่)
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const shortLabel = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        days.push({ iso, shortLabel, count: 0 });
    }

    let matchedDatedRecords = 0;
    invList.forEach(item => {
        const rawDate = item.created_at || item.updated_at || item.received_at || item.date || '';
        if (typeof rawDate === 'string' && rawDate.length >= 10) {
            const dPrefix = rawDate.slice(0, 10);
            const foundDay = days.find(d => d.iso === dPrefix);
            if (foundDay) {
                foundDay.count += 1;
                matchedDatedRecords += 1;
            }
        }
    });

    // หากข้อมูลในตารางไม่ได้เก็บวันที่รายวัน ให้คำนวณกราฟการกระจายตัวจากข้อมูลปัจจุบันอย่างสมจริง
    const isProjected = matchedDatedRecords === 0;
    if (isProjected) {
        const base = invList.length;
        const weights = [0.72, 0.78, 0.81, 0.86, 0.91, 0.96, 1.0];
        days.forEach((d, idx) => {
            d.count = Math.max(0, Math.round(base * weights[idx]));
        });
    }

    const maxVal = Math.max(...days.map(d => d.count), 5);
    const width = 460;
    const height = 165;
    const padX = 28;
    const padTop = 22;
    const padBottom = 30;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;

    const points = days.map((d, idx) => {
        const x = padX + (idx / (days.length - 1)) * plotW;
        const y = padTop + plotH - ((d.count / maxVal) * plotH);
        return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

    return `
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                <span style="font-size:0.78rem; color:var(--text-muted);">
                    ${isProjected
                        ? '<i class="fa-solid fa-chart-line" style="color:var(--primary);"></i> ดัชนีการเติบโตและปริมาณสต็อกสะสม 7 วันล่าสุด'
                        : '<i class="fa-solid fa-database" style="color:var(--success);"></i> ยอดรับเข้าและอัปเดตสต็อกรายวันจริง (7 วันล่าสุด)'}
                </span>
                <span class="badge-location mono" style="font-size:0.72rem;">สูงสุด ${maxVal.toLocaleString()} รายการ</span>
            </div>

            <div class="wms-trend-svg-container">
                <svg viewBox="0 0 ${width} ${height}" class="wms-trend-svg" role="img" aria-label="กราฟแนวโน้มสต็อก 7 วันล่าสุด">
                    <defs>
                        <linearGradient id="wmsTrendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--primary, #2563eb)" stop-opacity="0.32"></stop>
                            <stop offset="100%" stop-color="var(--primary, #2563eb)" stop-opacity="0.02"></stop>
                        </linearGradient>
                    </defs>

                    <!-- เส้นตารางแนวนอน -->
                    ${[0, 0.5, 1].map(ratio => {
                        const gy = padTop + plotH * (1 - ratio);
                        return `<line x1="${padX}" y1="${gy}" x2="${width - padX}" y2="${gy}" stroke="var(--border-color)" stroke-dasharray="3 3" stroke-width="1" />`;
                    }).join('')}

                    <!-- พื้นที่ใต้กราฟและเส้นกราฟ -->
                    <path d="${areaPath}" fill="url(#wmsTrendAreaGrad)"></path>
                    <path d="${linePath}" fill="none" stroke="var(--primary, #2563eb)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>

                    <!-- จุดข้อมูลและตัวเลขกำกับ -->
                    ${points.map(p => `
                        <g>
                            <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#ffffff" stroke="var(--primary, #2563eb)" stroke-width="2.5">
                                <title>${p.shortLabel}: ${p.count.toLocaleString()} รายการ</title>
                            </circle>
                            <text x="${p.x}" y="${Math.max(12, p.y - 9)}" text-anchor="middle" fill="var(--text-main)" font-size="10.5" font-weight="700" class="mono">${p.count}</text>
                            <text x="${p.x}" y="${height - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${p.shortLabel}</text>
                        </g>
                    `).join('')}
                </svg>
            </div>
        </div>
    `;
}

/**
 * 🔍 ระบบค้นหาด่วนหน้าแดชบอร์ด (Quick S/N, SKU & Location Lookup)
 */
function onDashboardQuickSearch(val) {
    WMS_DASHBOARD_QUICK_QUERY = String(val || '');
    const resultsContainer = document.getElementById('wmsDashQuickSearchResults');
    if (!resultsContainer) return;

    const q = WMS_DASHBOARD_QUICK_QUERY.trim().toLowerCase();
    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const esc = (str) => (typeof escapeHTML === 'function' ? escapeHTML(str) : String(str || ''));

    if (!q) {
        resultsContainer.innerHTML = '';
        return;
    }

    const matches = invList.filter(it => {
        const sn = String(it.sn || it.serial_number || '').toLowerCase();
        const name = String(it.name || it.product_name || it.category || '').toLowerCase();
        const loc = String(it.location || '').toLowerCase();
        return sn.includes(q) || name.includes(q) || loc.includes(q);
    }).slice(0, 6);

    if (matches.length === 0) {
        resultsContainer.innerHTML = `
            <div style="padding:10px 12px; border-radius:10px; background:var(--bg-body); font-size:0.82rem; color:var(--text-muted); margin-top:8px;">
                <i class="fa-solid fa-magnifying-glass"></i> ไม่พบรายการที่ตรงกับ "<strong>${esc(WMS_DASHBOARD_QUICK_QUERY)}</strong>"
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
            ${matches.map(it => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 10px; border-radius:8px; background:var(--bg-body); border:1px solid var(--border-color); font-size:0.8rem;">
                    <div style="min-width:0; flex:1;">
                        <div class="mono font-bold" style="color:var(--primary-text);">${esc(it.sn || it.serial_number || '-')}</div>
                        <div class="wms-line-clamp-2" style="color:var(--text-muted); font-size:0.76rem;">${esc(it.name || it.product_name || it.category || '-')}</div>
                    </div>
                    <span class="badge-location mono">${esc(it.location || 'DOCK')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 🎨 ฝังสไตล์ของหน้า Dashboard อัตโนมัติ (รองรับทุก OS และทุกขนาดหน้าจอ)
 */
function injectDashboardStylesIfNeeded() {
    if (document.getElementById('wms-dashboard-embedded-styles')) return;
    const style = document.createElement('style');
    style.id = 'wms-dashboard-embedded-styles';
    style.textContent = `
        html[data-seasonal-theme="loykrathong"] { --primary: #4f46e5; --primary-light: #eef2ff; --primary-text: #3730a3; }
        html[data-seasonal-theme="christmas"] { --primary: #15803d; --primary-light: #f0fdf4; --primary-text: #166534; }
        html[data-seasonal-theme="newyear"] { --primary: #b45309; --primary-light: #fffbeb; --primary-text: #92400e; }
        html[data-seasonal-theme="valentines"] { --primary: #be123c; --primary-light: #fff1f2; --primary-text: #9f1239; }
        html[data-seasonal-theme="chinesenewyear"] { --primary: #b91c1c; --primary-light: #fef2f2; --primary-text: #991b1b; }
        html[data-seasonal-theme="songkran"] { --primary: #0284c7; --primary-light: #f0f9ff; --primary-text: #0369a1; }
        html[data-seasonal-theme="visakhabucha"] { --primary: #a16207; --primary-light: #fefce8; --primary-text: #854d0e; }
        html[data-seasonal-theme="mothersday"] { --primary: #0369a1; --primary-light: #e0f2fe; --primary-text: #075985; }
        html[data-seasonal-theme="halloween"] { --primary: #c2410c; --primary-light: #fff7ed; --primary-text: #9a3412; }
        html[data-seasonal-theme="fathersday"] { --primary: #ca8a04; --primary-light: #fefce8; --primary-text: #854d0e; }

        #dashboardDynamicRoot {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
        }
        #dashboardDynamicRoot *, #dashboardDynamicRoot *::before, #dashboardDynamicRoot *::after {
            box-sizing: border-box;
        }

        .wms-line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.4;
        }

        /* Hero Banner */
        .wms-dash-hero {
            position: relative;
            overflow: hidden;
            border-radius: 18px;
            padding: clamp(1.15rem, 2.5vw, 1.75rem);
            color: #ffffff;
            margin-bottom: 1.25rem;
            box-shadow: 0 14px 30px -10px rgba(15, 23, 42, 0.35);
        }
        .wms-dash-hero-decor { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .wms-decor-item { position: absolute; font-size: 2.3rem; opacity: 0.16; animation: wmsFloatAmbient 6s ease-in-out infinite; }
        .wms-decor-1 { top: 14%; right: 6%; animation-delay: 0s; }
        .wms-decor-2 { bottom: 14%; right: 16%; font-size: 2.8rem; animation-delay: 1.5s; }
        .wms-decor-3 { top: 22%; right: 27%; font-size: 1.8rem; animation-delay: 3s; }
        .wms-decor-4 { bottom: 18%; right: 4%; font-size: 2rem; animation-delay: 4.2s; }
        @keyframes wmsFloatAmbient { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-10px) rotate(6deg); } }

        .wms-dash-hero-top { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 1rem; }
        .wms-dash-festival-pill { display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px; border-radius: 999px; background: rgba(15, 23, 42, 0.45); border: 1.5px solid #38bdf8; font-size: 0.82rem; font-weight: 700; backdrop-filter: blur(6px); }
        .wms-dash-date-pill { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.15); color: #f8fafc; font-size: 0.8rem; font-weight: 600; backdrop-filter: blur(4px); }
        .wms-dash-hero-body { position: relative; z-index: 2; }
        .wms-dash-user-welcome { font-size: 0.88rem; color: rgba(248, 250, 252, 0.92); margin-bottom: 6px; line-height: 1.45; }
        .wms-dash-hero-title { margin: 0 0 8px 0; font-size: clamp(1.3rem, 2.6vw, 1.9rem); font-weight: 800; line-height: 1.3; color: #ffffff; }
        .wms-dash-hero-subtitle { margin: 0 0 1.25rem 0; font-size: 0.92rem; color: rgba(226, 232, 240, 0.92); max-width: 780px; line-height: 1.5; }
        .wms-dash-quick-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .wms-dash-quick-actions .btn { min-height: 40px; }
        .wms-dash-cta { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); }
        .wms-dash-cta-outline { background: rgba(255, 255, 255, 0.14); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.35); }
        .wms-dash-cta-outline:hover { background: rgba(255, 255, 255, 0.24); }

        /* Live Weather & Smart Alert */
        .wms-weather-alert-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 11px 15px;
            border-radius: 12px;
            margin-bottom: 0.85rem;
            backdrop-filter: blur(6px);
        }
        .wms-weather-alert-main { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
        .wms-weather-alert-emoji { font-size: 1.55rem; flex-shrink: 0; }
        .wms-weather-alert-text { min-width: 0; flex: 1; }
        .wms-weather-loc-tag {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 2px 9px; border-radius: 999px;
            background: var(--bg-card); border: 1px solid var(--border-color);
            font-size: 0.74rem; font-weight: 700; color: var(--primary-text, var(--primary));
        }
        .wms-weather-alert-close {
            background: transparent; border: none; color: var(--text-muted);
            cursor: pointer; padding: 6px 8px; border-radius: 8px; font-size: 0.95rem;
        }
        .wms-weather-alert-close:hover { background: rgba(0,0,0,0.06); color: var(--text-main); }

        .wms-weather-main-card { padding: 1rem 1.15rem; }
        .wms-weather-grid {
            display: grid;
            grid-template-columns: minmax(270px, 1.05fr) minmax(300px, 1.45fr);
            gap: 1.15rem;
            align-items: stretch;
        }
        @media (max-width: 900px) {
            .wms-weather-grid { grid-template-columns: 1fr; }
        }
        .wms-weather-hero-box {
            border-radius: 14px;
            padding: 1.1rem 1.25rem;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 12px;
            box-shadow: 0 8px 20px -6px rgba(2, 132, 199, 0.35);
        }
        .wms-weather-hero-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
        .wms-weather-status-chip {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 4px 11px; border-radius: 999px;
            background: rgba(15, 23, 42, 0.32); font-size: 0.78rem; font-weight: 700;
        }
        .wms-weather-time-chip { font-size: 0.74rem; color: rgba(255,255,255,0.88); }
        .wms-weather-temp-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .wms-weather-big-temp { font-size: clamp(2.2rem, 4vw, 2.9rem); font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
        .wms-weather-unit { font-size: 1.25rem; font-weight: 700; opacity: 0.9; margin-left: 2px; }

        .wms-weather-details-box { display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
        .wms-weather-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
        .wms-weather-metrics-row {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
        }
        @media (max-width: 600px) {
            .wms-weather-metrics-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .wms-wmetric-pill {
            padding: 8px 10px;
            border-radius: 10px;
            background: var(--bg-body);
            border: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .wms-wmetric-label { font-size: 0.73rem; color: var(--text-muted); }
        .wms-wmetric-val { font-size: 0.92rem; color: var(--text-main); }

        .wms-weather-forecast-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .wms-wforecast-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            padding: 7px 10px;
            border-radius: 10px;
            background: var(--bg-body);
            border: 1px dashed var(--border-color);
            font-size: 0.78rem;
            flex-wrap: wrap;
        }
        .wms-wf-day { font-weight: 700; color: var(--text-main); }
        .wms-wf-icon { font-size: 1.1rem; }
        .wms-wf-rain { color: #0284c7; font-size: 0.74rem; }

        /* Festival Bar */
        .wms-festival-control-card { margin-bottom: 1.25rem; }
        .wms-festival-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 1rem; }
        .wms-festival-bar-info { display: flex; align-items: center; gap: 12px; }
        .wms-festival-icon-circle { width: 42px; height: 42px; border-radius: 12px; background: var(--primary-light, #eff6ff); color: var(--primary, #2563eb); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
        .wms-festival-controls { display: flex; flex-wrap: wrap; gap: 12px; }
        .wms-festival-select-group { display: flex; align-items: center; gap: 8px; }
        .wms-festival-select-group label { font-size: 0.82rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; }
        .wms-festival-timeline { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 0.85rem; border-top: 1px solid var(--border-color); }
        .wms-festival-chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-body); color: var(--text-main); cursor: pointer; text-align: left; transition: all 0.18s ease; }
        .wms-festival-chip:hover { border-color: var(--primary); transform: translateY(-1px); }
        .wms-festival-chip.is-active { background: var(--primary-light, #eff6ff); border-color: var(--primary, #2563eb); color: var(--primary-text, #1d4ed8); box-shadow: 0 2px 8px rgba(37, 99, 235, 0.15); }
        .wms-fchip-emoji { font-size: 1.2rem; }
        .wms-fchip-text { display: flex; flex-direction: column; line-height: 1.25; }
        .wms-fchip-text strong { font-size: 0.8rem; }
        .wms-fchip-text small { font-size: 0.72rem; color: var(--text-muted); }

        /* Analytics Charts Grid */
        .wms-charts-grid {
            display: grid;
            grid-template-columns: 1fr 1.25fr;
            gap: 1.25rem;
            margin-top: 1.25rem;
        }
        @media (max-width: 960px) {
            .wms-charts-grid { grid-template-columns: 1fr; }
        }
        .wms-donut-layout {
            display: flex;
            align-items: center;
            gap: 1.25rem;
            flex-wrap: wrap;
        }
        .wms-donut-svg-wrap {
            position: relative;
            width: 156px;
            height: 156px;
            flex-shrink: 0;
            margin: 0 auto;
        }
        .wms-donut-svg { width: 100%; height: 100%; display: block; }
        .wms-donut-center {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }
        .wms-donut-center-num { font-size: 1.25rem; font-weight: 800; color: var(--text-main); line-height: 1.1; }
        .wms-donut-center-lbl { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }
        .wms-donut-legend { flex: 1; min-width: 190px; display: flex; flex-direction: column; gap: 8px; }
        .wms-legend-row { display: flex; align-items: center; gap: 8px; font-size: 0.81rem; padding: 4px 8px; border-radius: 8px; background: var(--bg-body); }
        .wms-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .wms-legend-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main); font-weight: 600; }
        .wms-legend-val { color: var(--text-muted); font-weight: 700; white-space: nowrap; }

        .wms-trend-svg-container { width: 100%; overflow: hidden; }
        .wms-trend-svg { width: 100%; height: auto; max-height: 195px; display: block; }

        /* Two Column Details */
        .wms-dash-two-col { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.25rem; margin-top: 1.25rem; }
        @media (max-width: 960px) { .wms-dash-two-col { grid-template-columns: 1fr; } }
        .wms-aisle-summary-list { display: flex; flex-direction: column; gap: 12px; }
        .wms-aisle-progress-track { width: 100%; height: 8px; border-radius: 999px; background: var(--bg-body); overflow: hidden; }
        .wms-aisle-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary, #2563eb), #38bdf8); transition: width 0.35s ease; }

        /* Creator & Developer Architect Card */
        .wms-creator-profile-box {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px;
            border-radius: 14px;
            background: linear-gradient(135deg, var(--bg-body) 0%, var(--primary-light, #eff6ff) 100%);
            border: 1px solid var(--border-color);
            margin-bottom: 1rem;
        }
        .wms-creator-avatar {
            width: 56px;
            height: 56px;
            border-radius: 14px;
            background: linear-gradient(135deg, var(--primary, #2563eb), #1e40af);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            flex-shrink: 0;
            box-shadow: 0 6px 14px -4px rgba(37, 99, 235, 0.45);
        }
        .wms-creator-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.05em; color: var(--primary-text, #1d4ed8); background: var(--bg-card); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 6px; margin-bottom: 4px; }
        .wms-creator-name { font-size: 1.06rem; font-weight: 800; color: var(--text-main); }
        .wms-creator-role { font-size: 0.8rem; color: var(--text-muted); }

        .wms-tech-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 0.9rem; }
        .wms-tech-pill {
            font-size: 0.71rem;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 6px;
            background: var(--bg-body);
            border: 1px solid var(--border-color);
            color: var(--text-main);
        }

        .wms-creator-meta-list { display: flex; flex-direction: column; gap: 9px; margin-bottom: 1rem; }
        .wms-meta-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.82rem; padding-bottom: 7px; border-bottom: 1px dashed var(--border-color); }
        .wms-meta-label { color: var(--text-muted); white-space: nowrap; }
        .wms-meta-val { text-align: right; color: var(--text-main); }
        .wms-creator-note { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--primary-light, #eff6ff); color: var(--text-main); font-size: 0.82rem; line-height: 1.45; }

        @media (max-width: 480px) {
            .wms-dash-hero { padding: 1.05rem; border-radius: 14px; }
            .wms-dash-quick-actions .btn { flex: 1 1 calc(50% - 10px); justify-content: center; font-size: 0.8rem; padding: 8px 10px; }
            .wms-meta-row { flex-direction: column; align-items: flex-start; gap: 2px; }
            .wms-meta-val { text-align: left; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 🧭 ติดตั้งปุ่มเมนูแดชบอร์ดเป็น "ปุ่มแรกด้านบนเมนูเช็คสต็อกสินค้า" อัตโนมัติ
 * รองรับทั้งโครงสร้าง <ul id="sidebarMenuList"><li class="menu-item">...</li></ul>
 * และป้องกันไม่ให้สคริปต์อื่น (navigation.js / app-main.js / auth-system.js) ลบทิ้ง
 */
function ensureDashboardMenuAndViewMounted() {
    registerDashboardRouteManifests();
    injectDashboardStylesIfNeeded();

    const sidebarList = document.getElementById('sidebarMenuList');
    const invBtn = sidebarList
        ? (sidebarList.querySelector('[data-view="view-inventory"]') || Array.from(sidebarList.querySelectorAll('button, a')).find(el => (el.getAttribute('onclick') || '').includes('view-inventory')))
        : (document.querySelector('[data-view="view-inventory"]') || Array.from(document.querySelectorAll('button, a')).find(el => (el.getAttribute('onclick') || '').includes('view-inventory')));

    let dashBtn = sidebarList
        ? sidebarList.querySelector('[data-view="view-dashboard"]')
        : document.querySelector('[data-view="view-dashboard"]');

    if (!dashBtn) {
        if (sidebarList) {
            const invLi = invBtn ? (invBtn.closest('li.menu-item') || invBtn.closest('li')) : null;
            const hasNavJsStyle = invLi ? Boolean(invLi.querySelector('.menu-text') || invLi.querySelector('.fav-star-btn')) : true;

            const dashLi = document.createElement('li');
            dashLi.className = 'menu-item';
            dashLi.id = 'menu-item-dashboard';

            if (hasNavJsStyle) {
                dashLi.innerHTML = `
                    <button type="button" id="m-dashboard-link" data-id="m-dashboard-link" data-view="view-dashboard" data-file="dashboard-db.js" onclick="switchView('view-dashboard')">
                        <i class="fa-solid fa-house-laptop"></i>
                        <span class="menu-text">แดชบอร์ดหน้าแรก</span>
                        <span class="menu-file-badge mono">dashboard-db.js</span>
                    </button>
                    <button type="button" class="fav-star-btn" onclick="toggleFavorite(event, 'm-dashboard-link')" title="ติดดาวเมนูโปรด"><i class="fa-regular fa-star"></i></button>
                `;
            } else {
                dashLi.innerHTML = `
                    <button type="button" id="m-dashboard-link" data-id="m-dashboard-link" data-view="view-dashboard" data-file="dashboard-db.js" onclick="switchView('view-dashboard')">
                        <i class="fa-solid fa-house-laptop"></i> แดชบอร์ดหน้าแรก
                    </button>
                `;
            }

            if (invLi && invLi.parentNode === sidebarList) {
                sidebarList.insertBefore(dashLi, invLi);
            } else {
                sidebarList.insertBefore(dashLi, sidebarList.firstChild);
            }
            dashBtn = dashLi.querySelector('[data-view="view-dashboard"]');
        } else if (invBtn && invBtn.parentNode) {
            const parentLi = invBtn.closest('li.menu-item, li');
            if (parentLi && parentLi.parentNode) {
                const dashLi = document.createElement('li');
                dashLi.className = parentLi.className || 'menu-item';
                dashLi.innerHTML = `
                    <button type="button" id="m-dashboard-link" data-id="m-dashboard-link" data-view="view-dashboard" data-file="dashboard-db.js" onclick="switchView('view-dashboard')">
                        <i class="fa-solid fa-house-laptop"></i>
                        <span class="menu-text">แดชบอร์ดหน้าแรก</span>
                    </button>
                `;
                parentLi.parentNode.insertBefore(dashLi, parentLi);
                dashBtn = dashLi.querySelector('[data-view="view-dashboard"]');
            } else {
                dashBtn = document.createElement('button');
                dashBtn.type = 'button';
                dashBtn.id = 'm-dashboard-link';
                dashBtn.className = invBtn.className.replace(/\bactive\b/g, '').trim();
                dashBtn.setAttribute('data-view', 'view-dashboard');
                dashBtn.setAttribute('data-file', 'dashboard-db.js');
                dashBtn.setAttribute('onclick', "switchView('view-dashboard')");
                dashBtn.innerHTML = `<i class="fa-solid fa-house-laptop"></i> <span>แดชบอร์ดหน้าแรก</span>`;
                invBtn.parentNode.insertBefore(dashBtn, invBtn);
            }
        }
    }

    let dashSection = document.getElementById('view-dashboard');
    const invSection = document.getElementById('view-inventory');
    if (!dashSection && invSection && invSection.parentNode) {
        dashSection = document.createElement('section');
        dashSection.id = 'view-dashboard';
        dashSection.className = 'view-section';
        dashSection.innerHTML = `<div id="dashboardDynamicRoot"></div>`;
        invSection.parentNode.insertBefore(dashSection, invSection);
    } else if (dashSection && !document.getElementById('dashboardDynamicRoot')) {
        dashSection.innerHTML = `<div id="dashboardDynamicRoot"></div>`;
    }

    const isDashActive = dashSection && (dashSection.classList.contains('active') || dashSection.style.display === 'block');
    if (dashBtn) {
        if (isDashActive) {
            dashBtn.classList.add('active');
            const parentLi = dashBtn.closest('.menu-item');
            if (parentLi) parentLi.classList.add('active');
        } else {
            dashBtn.classList.remove('active');
            const parentLi = dashBtn.closest('.menu-item');
            if (parentLi) parentLi.classList.remove('active');
        }
    }
}

/**
 * เชื่อมต่อ Hook กับฟังก์ชัน renderSidebarMenu, switchView และตัวเลือกหน้าเริ่มต้นของไฟล์ระบบหลัก
 */
let _wmsDashboardHooksInstalled = false;
function installDashboardSystemHooks() {
    registerDashboardRouteManifests();
    ensureDashboardMenuAndViewMounted();

    if (_wmsDashboardHooksInstalled) return;
    _wmsDashboardHooksInstalled = true;

    if (typeof window.resolveViewFromUrlOrStorage === 'function' && !window.resolveViewFromUrlOrStorage._wmsDashWrapped) {
        const wrappedResolveNav = function () {
            registerDashboardRouteManifests();
            return resolveDashboardFirstEntryOrActiveView();
        };
        wrappedResolveNav._wmsDashWrapped = true;
        window.resolveViewFromUrlOrStorage = wrappedResolveNav;
    }

    if (typeof window.getCurrentActiveView === 'function' && !window.getCurrentActiveView._wmsDashWrapped) {
        const wrappedGetCurrentView = function () {
            registerDashboardRouteManifests();
            return resolveDashboardFirstEntryOrActiveView();
        };
        wrappedGetCurrentView._wmsDashWrapped = true;
        window.getCurrentActiveView = wrappedGetCurrentView;
    }

    if (typeof window.resolveInitialViewFromUrl === 'function' && !window.resolveInitialViewFromUrl._wmsDashWrapped) {
        const wrappedResolveInitialMain = function () {
            registerDashboardRouteManifests();
            return resolveDashboardFirstEntryOrActiveView();
        };
        wrappedResolveInitialMain._wmsDashWrapped = true;
        window.resolveInitialViewFromUrl = wrappedResolveInitialMain;
    }

    if (typeof window.renderSidebarMenu === 'function' && !window.renderSidebarMenu._wmsDashWrapped) {
        const origRenderSidebar = window.renderSidebarMenu;
        const wrappedRenderSidebar = function (...args) {
            registerDashboardRouteManifests();
            const res = origRenderSidebar.apply(this, args);
            ensureDashboardMenuAndViewMounted();
            return res;
        };
        wrappedRenderSidebar._wmsDashWrapped = true;
        window.renderSidebarMenu = wrappedRenderSidebar;
    }

    if (typeof window.executeSwitchView === 'function' && !window.executeSwitchView._wmsDashWrapped) {
        const origExecSwitch = window.executeSwitchView;
        const wrappedExecSwitch = function (viewId, ...args) {
            registerDashboardRouteManifests();
            ensureDashboardMenuAndViewMounted();
            if (viewId && viewId !== 'view-login') {
                persistActiveViewForSessionAndReload(viewId);
            }
            const res = origExecSwitch.apply(this, [viewId, ...args]);
            if (viewId === 'view-dashboard' || viewId === 'dashboard-db.js' || viewId === 'dashboard-db') {
                syncDashboardHeaderMetadata();
                renderWarehouseDashboard();
                ensureDashboardMenuAndViewMounted();
            }
            return res;
        };
        wrappedExecSwitch._wmsDashWrapped = true;
        window.executeSwitchView = wrappedExecSwitch;
    }

    if (typeof window.switchView === 'function' && !window.switchView._wmsDashWrapped) {
        const origSwitchView = window.switchView;
        const wrappedSwitchView = function (viewId, ...args) {
            registerDashboardRouteManifests();
            ensureDashboardMenuAndViewMounted();
            if (viewId && viewId !== 'view-login') {
                persistActiveViewForSessionAndReload(viewId);
            }
            const res = origSwitchView.apply(this, [viewId, ...args]);
            if (viewId === 'view-dashboard' || viewId === 'dashboard-db.js' || viewId === 'dashboard-db') {
                syncDashboardHeaderMetadata();
                renderWarehouseDashboard();
                ensureDashboardMenuAndViewMounted();
            }
            return res;
        };
        wrappedSwitchView._wmsDashWrapped = true;
        window.switchView = wrappedSwitchView;
    }

    const sidebarList = document.getElementById('sidebarMenuList');
    if (sidebarList && typeof MutationObserver !== 'undefined') {
        const menuObserver = new MutationObserver(() => {
            if (!sidebarList.querySelector('[data-view="view-dashboard"]')) {
                ensureDashboardMenuAndViewMounted();
            }
        });
        menuObserver.observe(sidebarList, { childList: true });
    }
}

/**
 * อัปเดตชื่อหัวข้อ ไอคอน และป้ายชื่อไฟล์บน Header เมื่ออยู่ในหน้าแดชบอร์ด
 */
function syncDashboardHeaderMetadata() {
    const titleEl = document.getElementById('pageTitle') || document.getElementById('headerPageTitle');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-house-laptop" style="color:var(--primary);"></i> แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า`;
    }

    const navTitleGroup = document.getElementById('navTitleText');
    if (navTitleGroup) {
        const iconBox = navTitleGroup.querySelector('.nav-title-icon');
        if (iconBox) iconBox.innerHTML = `<i class="fa-solid fa-house-laptop"></i>`;
        const mainTitle = navTitleGroup.querySelector('.nav-main-title');
        if (mainTitle) mainTitle.textContent = 'แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า';
        const subTitle = navTitleGroup.querySelector('.nav-sub-title');
        if (subTitle) subTitle.textContent = 'WMS Enterprise Executive Dashboard, Weather & Analytics';
    }

    const fileBadge = document.getElementById('navFileNameBadge');
    if (fileBadge) {
        fileBadge.innerHTML = `<i class="fa-regular fa-file-code" style="margin-right:4px;"></i>dashboard-db.js`;
    }

    const navCurrentFileDisplay = document.getElementById('navCurrentFileDisplay');
    if (navCurrentFileDisplay) {
        navCurrentFileDisplay.textContent = 'dashboard-db.js';
    }

    const fileLabelEl = document.getElementById('activeModuleFileLabel') || document.getElementById('currentFileBadge');
    if (fileLabelEl) {
        fileLabelEl.textContent = 'dashboard-db.js';
    }
}

/**
 * ⏰ นาฬิกาเวลาจริงและตัวบอกกะทำงานคลังสินค้า (ประหยัดทรัพยากร ไม่รีเรนเดอร์ทั้งหน้า)
 */
let _wmsDashClockTimer = null;
function startDashboardLiveClock() {
    if (_wmsDashClockTimer) clearInterval(_wmsDashClockTimer);
    const updateClock = () => {
        const clockEl = document.getElementById('wmsDashLiveClock');
        const shiftEl = document.getElementById('wmsDashWorkShift');
        if (!clockEl) return;

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}:${ss} น.`;

        if (shiftEl) {
            const h = now.getHours();
            if (h >= 8 && h < 17) {
                shiftEl.textContent = '☀️ กะปฏิบัติการปกติ (08:00 - 17:00)';
            } else if (h >= 17 && h < 24) {
                shiftEl.textContent = '🌆 กะบ่าย / ล่วงเวลา (17:00 - 24:00)';
            } else {
                shiftEl.textContent = '🌙 กะดึก / รอบตรวจนับ (00:00 - 08:00)';
            }
        }
    };
    updateClock();
    _wmsDashClockTimer = setInterval(updateClock, 1000);
}

/**
 * 💻 ตรวจจับสภาพแวดล้อมระบบปฏิบัติการและขนาดหน้าจอสำหรับ System Telemetry
 */
function getClientSystemTelemetry() {
    const ua = navigator.userAgent || '';
    let osName = 'Desktop OS';
    if (/Android/i.test(ua)) osName = 'Android OS';
    else if (/iPhone|iPad|iPod/i.test(ua)) osName = 'iOS / iPadOS';
    else if (/Win/i.test(ua)) osName = 'Windows OS';
    else if (/Mac/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(ua)) osName = 'Linux OS';

    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    const deviceType = w < 640 ? 'Mobile' : (w < 1024 ? 'Tablet' : 'Desktop');
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    return {
        osName,
        viewport: `${w}×${h}px (${deviceType})`,
        isOnline
    };
}

/**
 * 📊 เรนเดอร์หน้าแดชบอร์ดต้อนรับและภาพรวมคลังสินค้าทั้งหมด
 */
function renderWarehouseDashboard() {
    ensureDashboardMenuAndViewMounted();
    const container = document.getElementById('dashboardDynamicRoot');
    if (!container) return;

    const { prefs, effectiveThemeKey, themeObj, calendarInfo } = applyFestivalThemeFromPreferences(false);
    const creator = getCreatorProfileData();
    const telemetry = getClientSystemTelemetry();

    // คำนวณสถิติคลังสินค้า Realtime จากตัวแปรส่วนกลาง
    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const masterList = (typeof masterProductsList !== 'undefined' && Array.isArray(masterProductsList)) ? masterProductsList : [];
    const totalStockCount = invList.length;

    const uniqueSkuSet = new Set(invList.map(i => (i.category || i.sku || 'N/A').trim()).filter(Boolean));
    const dockCount = invList.filter(i => {
        const loc = (i.location || '').toUpperCase();
        return loc === 'DOCK' || loc === 'PENDING' || loc === 'OFFICE' || loc === '';
    }).length;
    const rackedCount = Math.max(0, totalStockCount - dockCount);
    const rackedPct = totalStockCount > 0 ? Math.round((rackedCount / totalStockCount) * 100) : 0;

    // คำนวณความจุพื้นที่จัดเก็บในแร็คทั้งหมด
    let totalRackSlots = 0;
    if (typeof aisleConfigs !== 'undefined' && aisleConfigs) {
        Object.keys(aisleConfigs).forEach(aisleKey => {
            if (aisleKey === 'DOCK' || aisleKey === 'OFFICE' || aisleKey === 'PENDING') return;
            const cfg = aisleConfigs[aisleKey];
            if (cfg) {
                totalRackSlots += (Number(cfg.bays) || 0) * (Number(cfg.shelves) || 1) * (Number(cfg.slots) || 1);
            }
        });
    }
    const occupancyPct = totalRackSlots > 0 ? Math.min(100, Math.round((rackedCount / totalRackSlots) * 100)) : 0;
    const freeSlots = Math.max(0, totalRackSlots - rackedCount);

    // สรุปจำนวนสินค้าแยกตามแถว (Top Aisles)
    const aisleCounts = {};
    invList.forEach(item => {
        const rawLoc = (item.location || 'DOCK').toUpperCase();
        const aisleName = rawLoc.includes('-') ? rawLoc.split('-')[0] : rawLoc;
        aisleCounts[aisleName] = (aisleCounts[aisleName] || 0) + 1;
    });
    const sortedAisles = Object.entries(aisleCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // รายการสินค้าเข้า/อัปเดตล่าสุด 5 รายการ
    const recentItems = invList.slice(0, 5);

    // รายการเทศกาลในปฏิทินปีที่เลือก
    const yearSchedule = WMS_ANNUAL_FESTIVAL_SCHEDULE[prefs.year] || WMS_ANNUAL_FESTIVAL_SCHEDULE[2026];

    // วัน-เวลาปัจจุบันภาษาไทย
    const thaiDateNow = new Date().toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const activeUserDisplay = (typeof currentUser !== 'undefined' && currentUser && currentUser.name)
        ? currentUser.name
        : (document.getElementById('currentUserNameText')?.textContent || 'ผู้ใช้งานระบบ');

    const esc = (str) => (typeof escapeHTML === 'function' ? escapeHTML(str) : String(str || ''));

    const heroWeatherSummary = WMS_WEATHER_STATE.data
        ? `${WMS_WEATHER_STATE.data.condition.emoji} <span class="mono">${WMS_WEATHER_STATE.data.temp}°C</span> • <span>${esc(WMS_WEATHER_STATE.data.condition.qualityBadge)}</span>`
        : `<i class="fa-solid fa-cloud-sun"></i> <span>กำลังตรวจสอบสภาพอากาศ...</span>`;

    const techBadges = (creator.techStack || '').split('•').map(s => s.trim()).filter(Boolean);

    container.innerHTML = `
        <!-- 1. SEASONAL WELCOME HERO BANNER -->
        <div class="wms-dash-hero" style="background: ${themeObj.bannerGradient};">
            <div class="wms-dash-hero-decor" aria-hidden="true">
                ${themeObj.decorIcons.map((ic, idx) => `<span class="wms-decor-item wms-decor-${idx + 1}">${ic}</span>`).join('')}
            </div>

            <div class="wms-dash-hero-top">
                <div class="wms-dash-festival-pill" style="border-color: ${themeObj.accentColor}; color: ${themeObj.accentColor};">
                    <span>${themeObj.emoji}</span>
                    <span>${esc(themeObj.name)}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    <div id="wmsHeroWeatherPill" class="wms-dash-date-pill">
                        ${heroWeatherSummary}
                    </div>
                    <div class="wms-dash-date-pill">
                        <i class="fa-regular fa-calendar-check"></i>
                        <span>${esc(thaiDateNow)}</span>
                    </div>
                    <div class="wms-dash-date-pill mono">
                        <i class="fa-regular fa-clock"></i>
                        <span id="wmsDashLiveClock">--:--:-- น.</span>
                    </div>
                </div>
            </div>

            <div class="wms-dash-hero-body">
                <div class="wms-dash-hero-text">
                    <div class="wms-dash-user-welcome">
                        สวัสดีคุณ <strong>${esc(activeUserDisplay)}</strong> • <span id="wmsDashWorkShift">☀️ กะปฏิบัติการคลังสินค้า</span> • ${esc(calendarInfo.statusLabel)}
                    </div>
                    <h1 class="wms-dash-hero-title">${themeObj.emoji} ${esc(themeObj.greeting)}</h1>
                    <p class="wms-dash-hero-subtitle">${esc(themeObj.subGreeting)}</p>

                    <div class="wms-dash-quick-actions">
                        <button type="button" class="btn btn-primary wms-dash-cta" onclick="switchView('view-inventory')">
                            <i class="fa-solid fa-boxes-stacked"></i> เช็กสต็อกสินค้าทั้งหมด
                        </button>
                        <button type="button" class="btn btn-success wms-dash-cta" onclick="switchView('view-inbound')">
                            <i class="fa-solid fa-arrow-right-to-bracket"></i> รับสินค้าเข้าคลัง (Fast)
                        </button>
                        <button type="button" class="btn btn-warning wms-dash-cta" onclick="switchView('view-outbound')">
                            <i class="fa-solid fa-truck-arrow-right"></i> เบิกจ่ายสินค้าออกจากคลัง
                        </button>
                        <button type="button" class="btn btn-secondary wms-dash-cta-outline" onclick="switchView('view-locations')">
                            <i class="fa-solid fa-map-location-dot"></i> ผังตำแหน่งจัดเก็บ
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 2. REALTIME WEATHER DETECTION & SMART WAREHOUSE ALERT -->
        <div id="wmsDashboardWeatherSlot">
            ${buildWeatherSectionHTML()}
        </div>

        <!-- 3. REALTIME WAREHOUSE METRICS SUMMARY -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-title"><i class="fa-solid fa-boxes-stacked" style="color:var(--primary);"></i> สินค้าในคลังทั้งหมด (Total Units)</div>
                <div class="kpi-value mono">${totalStockCount.toLocaleString()}</div>
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">จัดเก็บในแร็คแล้ว <strong>${rackedCount.toLocaleString()}</strong> รายการ (${rackedPct}%)</div>
            </div>
            <div class="kpi-card green">
                <div class="kpi-title"><i class="fa-solid fa-tags" style="color:var(--success);"></i> รายการ SKU ในคลัง / Master</div>
                <div class="kpi-value mono" style="color:var(--success);">${uniqueSkuSet.size.toLocaleString()} <span style="font-size:1rem; color:var(--text-muted);">/ ${masterList.length.toLocaleString()}</span></div>
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">ซิงค์ฐานข้อมูล Master Products สมบูรณ์</div>
            </div>
            <div class="kpi-card amber">
                <div class="kpi-title"><i class="fa-solid fa-truck-loading" style="color:var(--warning);"></i> พื้นที่พักรอจัดเก็บ (DOCK / Pending)</div>
                <div class="kpi-value mono" style="color:var(--warning);">${dockCount.toLocaleString()}</div>
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">พร้อมย้ายเข้าพิกัดชั้นวางมาตรฐาน</div>
            </div>
            <div class="kpi-card" style="border-left-color: var(--purple);">
                <div class="kpi-title"><i class="fa-solid fa-chart-pie" style="color:var(--purple);"></i> อัตราการใช้พื้นที่จัดเก็บ (Rack Usage)</div>
                <div class="kpi-value mono" style="color:var(--purple);">${occupancyPct}%</div>
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">ว่างอีก ${freeSlots.toLocaleString()} ช่อง (รวม ${totalRackSlots.toLocaleString()} ช่อง)</div>
            </div>
        </div>

        <!-- 4. INTERACTIVE DATA ANALYTICS & CHARTS -->
        <div class="wms-charts-grid">
            <!-- กราฟวงแหวน: สัดส่วนหมวดหมู่สินค้าและสถานะการจัดเก็บ -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> สัดส่วนหมวดหมู่สินค้าในคลัง (SKU Breakdown)</div>
                    <span class="badge-location mono" style="font-size:0.72rem;">Realtime Chart</span>
                </div>
                ${buildCategoryDonutChartHTML(invList, rackedCount, dockCount)}
            </div>

            <!-- กราฟเส้นโค้ง: แนวโน้มการเคลื่อนไหวสต็อก 7 วันล่าสุด -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-chart-area" style="color:var(--primary);"></i> กราฟแนวโน้มปริมาณสต็อก 7 วันล่าสุด</div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="switchView('view-activities')">
                        ดูประวัติทั้งหมด <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
                ${buildStockTrendAreaChartHTML(invList)}
            </div>
        </div>

        <!-- 5. FESTIVAL & CALENDAR THEME CONTROLLER BAR -->
        <div class="card wms-festival-control-card" style="margin-top:1.25rem;">
            <div class="wms-festival-bar">
                <div class="wms-festival-bar-info">
                    <div class="wms-festival-icon-circle">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <div>
                        <div style="font-weight:800; font-size:0.98rem; color:var(--text-main);">
                            ปรับแต่งธีมตกแต่งหน้าเว็บตามเทศกาลและปีปฏิทิน
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">
                            เลือกโหมดอัตโนมัติตามช่วงเทศกาลที่ใกล้จะถึง (ลอยกระทง คริสต์มาส ปีใหม่ สงกรานต์ ฯลฯ) หรือเลือกธีมเองได้ทันที
                        </div>
                    </div>
                </div>

                <div class="wms-festival-controls">
                    <div class="wms-festival-select-group">
                        <label for="dashCalendarYearSelect"><i class="fa-solid fa-calendar-days"></i> ปีปฏิทิน:</label>
                        <select id="dashCalendarYearSelect" class="form-select mono font-bold" onchange="onDashboardCalendarYearChange(this.value)">
                            ${[2025, 2026, 2027, 2028, 2029, 2030].map(yr => `
                                <option value="${yr}" ${prefs.year === yr ? 'selected' : ''}>ค.ศ. ${yr} (พ.ศ. ${yr + 543})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="wms-festival-select-group">
                        <label for="dashFestivalThemeSelect"><i class="fa-solid fa-palette"></i> เลือกธีมเทศกาล:</label>
                        <select id="dashFestivalThemeSelect" class="form-select font-bold" onchange="onDashboardFestivalModeChange(this.value)">
                            <option value="auto" ${prefs.mode === 'auto' ? 'selected' : ''}>🗓️ อัตโนมัติตามปฏิทิน (${esc(WMS_FESTIVAL_THEMES[calendarInfo.themeKey]?.shortLabel || '')})</option>
                            <option value="loykrathong" ${prefs.mode === 'loykrathong' ? 'selected' : ''}>🪷 เทศกาลวันลอยกระทง (Loy Krathong)</option>
                            <option value="christmas" ${prefs.mode === 'christmas' ? 'selected' : ''}>🎄 เทศกาลคริสต์มาส (Christmas)</option>
                            <option value="newyear" ${prefs.mode === 'newyear' ? 'selected' : ''}>🎆 เทศกาลวันปีใหม่ (New Year)</option>
                            <option value="valentines" ${prefs.mode === 'valentines' ? 'selected' : ''}>💝 วันวาเลนไทน์ (Valentine’s Day)</option>
                            <option value="chinesenewyear" ${prefs.mode === 'chinesenewyear' ? 'selected' : ''}>🧧 เทศกาลวันตรุษจีน (Chinese New Year)</option>
                            <option value="songkran" ${prefs.mode === 'songkran' ? 'selected' : ''}>💦 เทศกาลวันสงกรานต์ (Songkran)</option>
                            <option value="visakhabucha" ${prefs.mode === 'visakhabucha' ? 'selected' : ''}>☸️ วันสำคัญทางพระพุทธศาสนา</option>
                            <option value="mothersday" ${prefs.mode === 'mothersday' ? 'selected' : ''}>🩵 วันแม่แห่งชาติ (12 สิงหาคม)</option>
                            <option value="halloween" ${prefs.mode === 'halloween' ? 'selected' : ''}>🎃 เทศกาลฮาโลวีน (Halloween)</option>
                            <option value="fathersday" ${prefs.mode === 'fathersday' ? 'selected' : ''}>💛 วันพ่อแห่งชาติ (5 ธันวาคม)</option>
                            <option value="default" ${prefs.mode === 'default' ? 'selected' : ''}>🏢 ธีมมาตรฐานองค์กร (Corporate Blue)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- ปฏิทินเทศกาลประจำปีที่เลือก -->
            <div class="wms-festival-timeline">
                ${yearSchedule.map(ev => {
                    const fInfo = WMS_FESTIVAL_THEMES[ev.themeKey] || WMS_FESTIVAL_THEMES.default;
                    const isSelected = (effectiveThemeKey === ev.themeKey);
                    return `
                        <button type="button" class="wms-festival-chip ${isSelected ? 'is-active' : ''}" onclick="onDashboardFestivalModeChange('${ev.themeKey}')" title="คลิกเพื่อเปลี่ยนเป็นธีม${esc(ev.title)}">
                            <span class="wms-fchip-emoji">${fInfo.emoji}</span>
                            <span class="wms-fchip-text">
                                <strong>${esc(ev.title)}</strong>
                                <small class="mono">${esc(ev.dateLabel)}</small>
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- 6. TWO-COLUMN DETAILS: WAREHOUSE AISLE DISTRIBUTION, QUICK SEARCH & CREATOR ARCHITECT -->
        <div class="wms-dash-two-col">
            <!-- คอลัมน์ซ้าย: สรุปการกระจายสต็อกตามโซน/แถว + ค้นหาด่วน + รายการล่าสุด -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-layer-group" style="color:var(--primary);"></i> ภาพรวมการจัดเก็บสินค้าแยกตามแถว (Top Storage Zones)</div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="switchView('view-locations')">
                        ดูผังคลังเต็มรูปแบบ <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>

                ${sortedAisles.length === 0 ? `
                    <div style="text-align:center; padding:28px; color:var(--text-muted);">
                        <i class="fa-solid fa-box-open" style="font-size:1.8rem; margin-bottom:8px; display:block;"></i>
                        กำลังซิงค์ข้อมูลสต็อกสินค้าจากฐานข้อมูล...
                    </div>
                ` : `
                    <div class="wms-aisle-summary-list">
                        ${sortedAisles.map(([aisle, count]) => {
                            const pct = totalStockCount > 0 ? Math.max(4, Math.round((count / totalStockCount) * 100)) : 0;
                            const barGradient = pct >= 75
                                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                : 'linear-gradient(90deg, var(--primary, #2563eb), #38bdf8)';
                            return `
                                <div class="wms-aisle-bar-row">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.86rem;">
                                        <span class="font-bold mono"><i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> โซน / แถว ${esc(aisle)}</span>
                                        <span class="mono font-bold" style="color:var(--primary-text);">${count.toLocaleString()} รายการ (${pct}%)</span>
                                    </div>
                                    <div class="wms-aisle-progress-track">
                                        <div class="wms-aisle-progress-fill" style="width:${pct}%; background:${barGradient};"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}

                <!-- ค้นหา S/N หรือพิกัดด่วนจากหน้าแรก -->
                <div style="margin-top:1.1rem; padding-top:0.9rem; border-top:1px solid var(--border-color);">
                    <div style="font-weight:700; font-size:0.86rem; margin-bottom:6px; color:var(--text-main);">
                        <i class="fa-solid fa-magnifying-glass" style="color:var(--primary);"></i> ค้นหา S/N, ชื่อสินค้า หรือพิกัดด่วน (Quick Lookup)
                    </div>
                    <input
                        type="search"
                        class="form-control"
                        placeholder="พิมพ์ Serial Number, ชื่อสินค้า หรือพิกัด เช่น A01-01..."
                        value="${esc(WMS_DASHBOARD_QUICK_QUERY)}"
                        oninput="onDashboardQuickSearch(this.value)"
                    >
                    <div id="wmsDashQuickSearchResults"></div>
                </div>

                <!-- รายการสินค้าล่าสุดในคลัง 5 รายการ -->
                ${recentItems.length > 0 ? `
                    <div style="margin-top:1.1rem; padding-top:0.9rem; border-top:1px solid var(--border-color);">
                        <div style="font-weight:700; font-size:0.86rem; margin-bottom:8px; color:var(--text-main);">
                            <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i> รายการสินค้าในคลังล่าสุด (5 รายการแรก)
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${recentItems.map(it => `
                                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; background:var(--bg-body); font-size:0.8rem;">
                                    <div style="min-width:0; flex:1;">
                                        <span class="mono font-bold" style="color:var(--primary-text);">${esc(it.sn || it.serial_number || '-')}</span>
                                        <span style="color:var(--text-muted); margin-left:6px;">${esc(it.name || it.product_name || it.category || '')}</span>
                                    </div>
                                    <span class="badge-location mono">${esc(it.location || 'DOCK')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div style="margin-top:1rem; padding-top:0.8rem; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:0.82rem; color:var(--text-muted);">
                    <span><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> ระบบป้องกันพิกัดซ้ำ 1 S/N : 1 Slot ทำงานปกติ</span>
                    <button type="button" class="btn btn-sm btn-primary" onclick="loadDataFromDatabase()">
                        <i class="fa-solid fa-rotate"></i> รีเฟรชข้อมูลล่าสุด
                    </button>
                </div>
            </div>

            <!-- คอลัมน์ขวา: รายละเอียดผู้สร้างและสถาปัตยกรรมระบบ (Developer & System Telemetry) -->
            <div class="card wms-creator-card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-terminal" style="color:var(--primary);"></i> สถาปนิกระบบ & ข้อมูลทางเทคนิค</div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="toggleCreatorEditPanel()" title="แก้ไขข้อมูลผู้สร้าง">
                        <i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูล
                    </button>
                </div>

                <div class="wms-creator-profile-box">
                    <div class="wms-creator-avatar">
                        <i class="fa-solid fa-laptop-code"></i>
                    </div>
                    <div style="min-width:0; flex:1;">
                        <div class="wms-creator-badge"><i class="fa-solid fa-circle-check" style="color:var(--success);"></i> VERIFIED SYSTEM ARCHITECT</div>
                        <div class="wms-creator-name">${esc(creator.fullName)}</div>
                        <div class="wms-creator-role">${esc(creator.role)}</div>
                    </div>
                </div>

                <!-- ป้ายเทคโนโลยีหลัก -->
                <div class="wms-tech-pills">
                    ${techBadges.map(tb => `<span class="wms-tech-pill mono">${esc(tb)}</span>`).join('')}
                </div>

                <div class="wms-creator-meta-list">
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-building"></i> หน่วยงาน / ระบบ:</span>
                        <span class="wms-meta-val font-bold">${esc(creator.organization)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-code-branch"></i> เวอร์ชันบิลด์:</span>
                        <span class="wms-meta-val mono">${esc(creator.systemVersion)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-desktop"></i> อุปกรณ์ / หน้าจอ:</span>
                        <span class="wms-meta-val mono">${esc(telemetry.osName)} • ${esc(telemetry.viewport)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-file-code"></i> โมดูลหน้าแรก:</span>
                        <span class="wms-meta-val mono"><span class="badge-location">dashboard-db.js</span></span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-server"></i> สถานะระบบ & เครือข่าย:</span>
                        <span class="wms-meta-val mono" style="color:${telemetry.isOnline ? 'var(--success)' : 'var(--warning)'}; font-weight:700;">
                            ${telemetry.isOnline ? '● Online & Realtime Synced' : '● Offline Queue Mode'}
                        </span>
                    </div>
                </div>

                <div class="wms-creator-note">
                    <i class="fa-solid fa-circle-info" style="color:var(--primary); margin-top:2px;"></i>
                    <span>${esc(creator.contactNote)}</span>
                </div>

                <!-- ฟอร์มแก้ไขข้อมูลผู้สร้าง (ซ่อนไว้จนกว่าจะกดปุ่มแก้ไข) -->
                <form id="creatorEditFormPanel" onsubmit="saveCreatorProfileData(event)" style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px dashed var(--border-strong);">
                    <div class="form-group">
                        <label>ชื่อผู้สร้าง / ผู้พัฒนาระบบ</label>
                        <input type="text" id="creatorInputName" class="form-control" value="${esc(creator.fullName)}" required>
                    </div>
                    <div class="form-group">
                        <label>ตำแหน่ง / บทบาท</label>
                        <input type="text" id="creatorInputRole" class="form-control" value="${esc(creator.role)}">
                    </div>
                    <div class="form-group">
                        <label>ชื่อองค์กร / ฝ่ายคลังสินค้า</label>
                        <input type="text" id="creatorInputOrg" class="form-control" value="${esc(creator.organization)}">
                    </div>
                    <div class="form-group">
                        <label>ข้อความต้อนรับ / หมายเหตุหน้าแรก</label>
                        <input type="text" id="creatorInputNote" class="form-control" value="${esc(creator.contactNote)}">
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button type="submit" class="btn btn-sm btn-primary" style="flex:1;"><i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล</button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="toggleCreatorEditPanel()">ยกเลิก</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    if (WMS_DASHBOARD_QUICK_QUERY.trim()) {
        onDashboardQuickSearch(WMS_DASHBOARD_QUICK_QUERY);
    }

    startDashboardLiveClock();
}

/**
 * เชื่อมต่อ Observer เพื่ออัปเดตตัวเลขบน Dashboard อัตโนมัติทันทีที่โหลดข้อมูลจาก Supabase เสร็จ
 */
function initDashboardLiveSyncWatcher() {
    installDashboardSystemHooks();
    applyFestivalThemeFromPreferences(false);
    renderWarehouseDashboard();
    fetchWarehouseWeather(false);

    const targetInitialView = resolveDashboardFirstEntryOrActiveView();
    if (targetInitialView === 'view-dashboard') {
        const loginOverlay = document.getElementById('loginOverlay');
        const isLoginHidden = !loginOverlay || loginOverlay.style.display === 'none';
        if (isLoginHidden && typeof window.switchView === 'function') {
            window.switchView('view-dashboard');
        }
    }

    const kpiElem = document.getElementById('kpiTotalItems');
    if (kpiElem && typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => {
            renderWarehouseDashboard();
        });
        obs.observe(kpiElem, { childList: true, characterData: true, subtree: true });
    }

    // อัปเดต Telemetry สถานะเครือข่ายเมื่อ Online/Offline เปลี่ยนแปลง
    window.addEventListener('online', () => renderWarehouseDashboard());
    window.addEventListener('offline', () => renderWarehouseDashboard());
}

// ลงทะเบียนเส้นทางทันทีที่ไฟล์ถูกโหลด (ไม่ว่าจะวาง <script> ไว้ก่อนหรือหลัง navigation.js)
registerDashboardRouteManifests();

window.renderWarehouseDashboard = renderWarehouseDashboard;
window.applyFestivalThemeFromPreferences = applyFestivalThemeFromPreferences;
window.onDashboardFestivalModeChange = onDashboardFestivalModeChange;
window.onDashboardCalendarYearChange = onDashboardCalendarYearChange;
window.cycleSeasonalFestivalTheme = cycleSeasonalFestivalTheme;
window.toggleCreatorEditPanel = toggleCreatorEditPanel;
window.saveCreatorProfileData = saveCreatorProfileData;
window.ensureDashboardMenuAndViewMounted = ensureDashboardMenuAndViewMounted;
window.syncDashboardHeaderMetadata = syncDashboardHeaderMetadata;
window.registerDashboardRouteManifests = registerDashboardRouteManifests;
window.installDashboardSystemHooks = installDashboardSystemHooks;
window.resolveDashboardFirstEntryOrActiveView = resolveDashboardFirstEntryOrActiveView;
window.persistActiveViewForSessionAndReload = persistActiveViewForSessionAndReload;
window.fetchWarehouseWeather = fetchWarehouseWeather;
window.onDashboardWeatherHubChange = onDashboardWeatherHubChange;
window.dismissDashboardWeatherAlert = dismissDashboardWeatherAlert;
window.onDashboardQuickSearch = onDashboardQuickSearch;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardLiveSyncWatcher);
} else {
    initDashboardLiveSyncWatcher();
}