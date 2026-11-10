const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 📂 ตรวจสอบและสร้างโฟลเดอร์สำหรับเก็บรูปภาพบนเครื่อง PC ของคุณอัตโนมัติ
const uploadDir = path.join(__dirname, 'public', 'uploads', 'albums');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ⚙️ ตั้งค่าตำแหน่งจัดเก็บและแปรรูปชื่อไฟล์เพื่อไม่ให้ชื่อรูปภาพซ้ำกันใน PC
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // รูปภาพทั้งหมดจะถูกเซฟลงโฟลเดอร์ public/uploads/albums
    },
    filename: function (req, file, cb) {
        // ใช้เวลาปัจจุบัน (Timestamp) เป็นตัวตั้งชื่อไฟล์ใหม่เพื่อป้องกันชื่อซ้ำ
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// 🛡️ ระบบตรวจสอบประเภทไฟล์ (กรองเฉพาะไฟล์รูปภาพเท่านั้นเพื่อความปลอดภัยของ PC)
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('ระบบรองรับเฉพาะไฟล์รูปภาพเท่านั้นค่ะ! (.jpg, .jpeg, .png, .gif)'));
    }
};

// 📦 จัดการรวมระบบทั้งหมดลงในตัวแปรสำหรับส่งออกไปใช้งาน
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // จำกัดขนาดรูปภาพไม่เกิน 5MB ต่อไฟล์
    fileFilter: fileFilter
});

// ส่งออกโมดูลเพื่อให้ไฟล์ server.js สามารถเรียกเปิดใช้ระบบอัปโหลดได้
module.exports = upload;

