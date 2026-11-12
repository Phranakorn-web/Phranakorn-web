// =========================================================================
// --- MODULE: EXECUTIVE DASHBOARD & SEASONAL CALENDAR THEME ENGINE ---
// --- FILE: dashboard-db.js (STANDALONE MODULAR CONTROLLER) ---
// =========================================================================

/**
 * 👨‍💼 ข้อมูลผู้สร้างและพัฒนาระบบ (Creator & System Metadata)
 */
const WMS_DEFAULT_CREATOR_INFO = {
    fullName: 'คุณนคร จันทร์ทป (Nakorn Chanthob)',
    role: 'System Architect & Lead Full-Stack Developer',
    organization: 'WMS Enterprise Warehouse Operations',
    systemVersion: 'WMS Enterprise Ultimate Security v2026.15',
    techStack: 'HTML5 • Modular JS • Supabase Realtime • JsBarcode • SheetJS',
    contactNote: 'ระบบบริหารจัดการคลังสินค้าอัจฉริยะ รองรับการทำงานแบบ Multi-Platform & Realtime Sync'
};

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
        subGreeting: 'ติดตามสถานะสต็อกสินค้า พิกัดจัดเก็บ และการรับ-จ่ายสินค้าแบบ Realtime',
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

        // 1. กรณีเข้าหน้าเว็บไซต์ครั้งแรก (Session ใหม่ และไม่ได้เปิดเจาะจงลิงก์เมนูอื่น)
        if (!sessionStarted && !isReload && !explicitUrlView) {
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED, '1');
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, 'view-dashboard');
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW, 'view-dashboard');
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID, 'view-dashboard');
            return 'view-dashboard';
        }

        // บันทึกว่า Session ปัจจุบันเริ่มต้นใช้งานแล้ว
        sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_STARTED, '1');

        // 2. กรณีผู้ใช้กดรีเฟรชหรือเปิดลิงก์ที่มีระบุหน้าเมนูใน URL -> คงอยู่หน้าเมนูนั้นตามโครงสร้างเดิม
        if (explicitUrlView) {
            sessionStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.SESSION_ACTIVE_VIEW, explicitUrlView);
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.LAST_ACTIVE_VIEW, explicitUrlView);
            localStorage.setItem(WMS_DASHBOARD_SESSION_KEYS.ACTIVE_VIEW_ID, explicitUrlView);
            return explicitUrlView;
        }

        // 3. กรณีรีเฟรชภายในแท็บเดิมหรือมีประวัติเมนูที่กำลังใช้งานอยู่ -> คงหน้าเมนูเดิมไว้
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

    // 1. ตรวจสอบว่าอยู่ในช่วงเทศกาลใดของปีที่เลือกหรือไม่
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

    // 2. หากไม่อยู่ในช่วง ให้หาเทศกาลที่ใกล้จะถึงถัดไป
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

    // อัปเดตป้ายบน Sidebar และ Top Navbar
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

/**
 * เปลี่ยนธีมเทศกาลจากตัวเลือกบนหน้า Dashboard
 */
function onDashboardFestivalModeChange(newMode) {
    localStorage.setItem('WMS_SEASONAL_THEME_MODE', newMode);
    applyFestivalThemeFromPreferences(true);
    renderWarehouseDashboard();
}

/**
 * เปลี่ยนปีปฏิทินเทศกาลจากตัวเลือกบนหน้า Dashboard
 */
function onDashboardCalendarYearChange(newYear) {
    localStorage.setItem('WMS_FESTIVAL_CALENDAR_YEAR', String(newYear));
    applyFestivalThemeFromPreferences(false);
    renderWarehouseDashboard();
}

/**
 * สลับธีมเทศกาลจากปุ่มบน Top Navbar
 */
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
            subtitle: 'WMS Enterprise Executive Dashboard & Seasonal Theme',
            icon: 'fa-house-laptop',
            catId: 'cat-warehouse',
            linkId: 'm-dashboard-link',
            fileName: 'dashboard-db.js'
        };
    }

    if (typeof window.WMS_ROUTE_MANIFEST === 'object' && window.WMS_ROUTE_MANIFEST !== null) {
        window.WMS_ROUTE_MANIFEST['view-dashboard'] = {
            title: 'แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า',
            subtitle: 'WMS Enterprise Executive Dashboard & Seasonal Theme',
            icon: 'fa-house-laptop',
            urlSlug: 'dashboard-db',
            fileName: 'dashboard-db.js',
            dbFolder: 'supabase/dashboard_overview'
        };
    }
}

/**
 * 🎨 ฝังสไตล์ของหน้า Dashboard อัตโนมัติ (กรณีไม่ได้โหลด dashboard-style.css แยกไว้ใน index.html)
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

        .wms-dash-hero {
            position: relative;
            overflow: hidden;
            border-radius: 16px;
            padding: 1.65rem 1.8rem;
            color: #ffffff;
            margin-bottom: 1.25rem;
            box-shadow: 0 12px 28px -8px rgba(15, 23, 42, 0.32);
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
        .wms-dash-date-pill { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); color: #f8fafc; font-size: 0.8rem; font-weight: 600; }
        .wms-dash-hero-body { position: relative; z-index: 2; }
        .wms-dash-user-welcome { font-size: 0.88rem; color: rgba(248, 250, 252, 0.92); margin-bottom: 6px; }
        .wms-dash-hero-title { margin: 0 0 8px 0; font-size: clamp(1.35rem, 2.5vw, 1.9rem); font-weight: 800; line-height: 1.3; color: #ffffff; }
        .wms-dash-hero-subtitle { margin: 0 0 1.25rem 0; font-size: 0.94rem; color: rgba(226, 232, 240, 0.92); max-width: 760px; }
        .wms-dash-quick-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .wms-dash-cta { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); }
        .wms-dash-cta-outline { background: rgba(255, 255, 255, 0.14); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.35); }
        .wms-dash-cta-outline:hover { background: rgba(255, 255, 255, 0.24); }

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

        .wms-dash-two-col { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.25rem; margin-top: 1.25rem; }
        @media (max-width: 960px) { .wms-dash-two-col { grid-template-columns: 1fr; } }
        .wms-aisle-summary-list { display: flex; flex-direction: column; gap: 12px; }
        .wms-aisle-progress-track { width: 100%; height: 8px; border-radius: 999px; background: var(--bg-body); overflow: hidden; }
        .wms-aisle-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary, #2563eb), #38bdf8); transition: width 0.35s ease; }

        .wms-creator-profile-box { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 12px; background: var(--bg-body); border: 1px solid var(--border-color); margin-bottom: 1rem; }
        .wms-creator-avatar { width: 54px; height: 54px; border-radius: 14px; background: var(--primary, #2563eb); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; }
        .wms-creator-badge { display: inline-block; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.05em; color: var(--primary-text, #1d4ed8); background: var(--primary-light, #eff6ff); padding: 2px 8px; border-radius: 6px; margin-bottom: 4px; }
        .wms-creator-name { font-size: 1.05rem; font-weight: 800; color: var(--text-main); }
        .wms-creator-role { font-size: 0.8rem; color: var(--text-muted); }
        .wms-creator-meta-list { display: flex; flex-direction: column; gap: 9px; margin-bottom: 1rem; }
        .wms-meta-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.83rem; padding-bottom: 7px; border-bottom: 1px dashed var(--border-color); }
        .wms-meta-label { color: var(--text-muted); white-space: nowrap; }
        .wms-meta-val { text-align: right; color: var(--text-main); }
        .wms-creator-note { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--primary-light, #eff6ff); color: var(--text-main); font-size: 0.82rem; line-height: 1.45; }
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

    // 1. สร้าง/แทรกปุ่มเมนูแดชบอร์ดไว้ด้านบนเมนู "เช็คสต็อกสินค้า"
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
            // Fallback กรณีเป็นเมนูแบบปุ่มเดี่ยวไม่ได้อยู่ใน <ul>
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

    // 2. ตรวจสอบ Section หน้าจอ view-dashboard
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

    // 3. ซิงค์สถานะ Active ของปุ่มเมนูแดชบอร์ดให้ตรงกับหน้าปัจจุบัน
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

    // 0. Hook ฟังก์ชันหาหน้าเริ่มต้นของ navigation.js และ app-main.js
    // เพื่อให้การเข้าเว็บไซต์ครั้งแรกเปิดหน้าแดชบอร์ดเป็นหลัก แต่การรีเฟรชหรืออยู่ในเมนูอื่นยังคงอยู่หน้าเดิม
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

    // 1. Hook renderSidebarMenu เพื่อให้ปุ่มแดชบอร์ดอยู่ด้านบนปุ่มเช็คสต็อกสินค้าเสมอ
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

    // 2. Hook executeSwitchView และ switchView เพื่อให้สลับเข้าหน้า view-dashboard และบันทึกสถานะหน้าปัจจุบันไว้สำหรับรีเฟรช
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

    // 3. เฝ้าสังเกต #sidebarMenuList เผื่อสคริปต์อื่นรีเซ็ต innerHTML ของเมนู
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
        if (subTitle) subTitle.textContent = 'WMS Enterprise Executive Dashboard & Seasonal Theme';
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
 * 📊 เรนเดอร์หน้าแดชบอร์ดต้อนรับและภาพรวมคลังสินค้าทั้งหมด
 */
function renderWarehouseDashboard() {
    ensureDashboardMenuAndViewMounted();
    const container = document.getElementById('dashboardDynamicRoot');
    if (!container) return;

    const { prefs, effectiveThemeKey, themeObj, calendarInfo } = applyFestivalThemeFromPreferences(false);
    const creator = getCreatorProfileData();

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

        <!-- 2. FESTIVAL & CALENDAR THEME CONTROLLER BAR -->
        <div class="card wms-festival-control-card">
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

        <!-- 3. REALTIME WAREHOUSE METRICS SUMMARY -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-title"><i class="fa-solid fa-boxes-stacked" style="color:var(--primary);"></i> สินค้าในคลังทั้งหมด (Total Units)</div>
                <div class="kpi-value mono">${totalStockCount.toLocaleString()}</div>
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">จัดเก็บในแร็คแล้ว ${rackedCount.toLocaleString()} รายการ</div>
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
                <div style="font-size:0.76rem; color:var(--text-muted); margin-top:4px;">ความจุแร็ครวม ${totalRackSlots.toLocaleString()} ช่อง</div>
            </div>
        </div>

        <!-- 4. TWO-COLUMN DETAILS: WAREHOUSE AISLE DISTRIBUTION & CREATOR PROFILE -->
        <div class="wms-dash-two-col">
            <!-- คอลัมน์ซ้าย: สรุปการกระจายสต็อกตามโซน/แถว + รายการล่าสุด -->
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
                            return `
                                <div class="wms-aisle-bar-row">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.86rem;">
                                        <span class="font-bold mono"><i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> โซน / แถว ${esc(aisle)}</span>
                                        <span class="mono font-bold" style="color:var(--primary-text);">${count.toLocaleString()} รายการ (${pct}%)</span>
                                    </div>
                                    <div class="wms-aisle-progress-track">
                                        <div class="wms-aisle-progress-fill" style="width:${pct}%;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}

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

            <!-- คอลัมน์ขวา: รายละเอียดผู้สร้างและข้อมูลระบบ -->
            <div class="card wms-creator-card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-id-card-clip" style="color:var(--primary);"></i> รายละเอียดผู้สร้างและข้อมูลระบบ</div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="toggleCreatorEditPanel()" title="แก้ไขข้อมูลผู้สร้าง">
                        <i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูล
                    </button>
                </div>

                <div class="wms-creator-profile-box">
                    <div class="wms-creator-avatar">
                        <i class="fa-solid fa-user-tie"></i>
                    </div>
                    <div style="min-width:0; flex:1;">
                        <div class="wms-creator-badge">CREATOR & SYSTEM ARCHITECT</div>
                        <div class="wms-creator-name">${esc(creator.fullName)}</div>
                        <div class="wms-creator-role">${esc(creator.role)}</div>
                    </div>
                </div>

                <div class="wms-creator-meta-list">
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-building"></i> หน่วยงาน / ระบบ:</span>
                        <span class="wms-meta-val font-bold">${esc(creator.organization)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-code-branch"></i> เวอร์ชันระบบ:</span>
                        <span class="wms-meta-val mono">${esc(creator.systemVersion)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-layer-group"></i> เทคโนโลยีหลัก:</span>
                        <span class="wms-meta-val mono" style="font-size:0.78rem;">${esc(creator.techStack)}</span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-file-code"></i> โมดูลหน้าแรก:</span>
                        <span class="wms-meta-val mono"><span class="badge-location">dashboard-db.js</span></span>
                    </div>
                    <div class="wms-meta-row">
                        <span class="wms-meta-label"><i class="fa-solid fa-server"></i> สถานะโมดูลระบบ:</span>
                        <span class="wms-meta-val mono" style="color:var(--success); font-weight:700;">● Active & Synchronized</span>
                    </div>
                </div>

                <div class="wms-creator-note">
                    <i class="fa-solid fa-circle-info" style="color:var(--primary);"></i>
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

    startDashboardLiveClock();
}

/**
 * เชื่อมต่อ Observer เพื่ออัปเดตตัวเลขบน Dashboard อัตโนมัติทันทีที่โหลดข้อมูลจาก Supabase เสร็จ
 */
function initDashboardLiveSyncWatcher() {
    installDashboardSystemHooks();
    applyFestivalThemeFromPreferences(false);
    renderWarehouseDashboard();

    // ตรวจสอบหน้าเป้าหมายที่เหมาะสม:
    // - เข้าเว็บไซต์ครั้งแรก -> แสดงหน้าแดชบอร์ดหน้าแรก (view-dashboard) เป็นหลัก
    // - กดรีเฟรชหรืออยู่ในเมนูอื่น ๆ -> คงอยู่หน้าเมนูเดิมตามโครงสร้างเดิม
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardLiveSyncWatcher);
} else {
    initDashboardLiveSyncWatcher();
}