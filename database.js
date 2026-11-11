const mongoose = require('mongoose');

// 🟢 ระบุที่อยู่ฐานข้อมูลในเครื่อง PC ของคุณ (รันผ่าน Port มาตรฐาน 27017)
// และตั้งชื่อฐานข้อมูลในเครื่องคอมว่า pinggo_db
const mongoURI = 'mongodb://127.0.0.1:27017/pinggo_db';

// ฟังก์ชันสั่งเชื่อมต่อไปยังโปรแกรม MongoDB ในคอมพิวเตอร์
const connectDB = async () => {
    try {
                await mongoose.connect(mongoURI);

        });
        console.log('🗄️ [PingGo DB] เชื่อมต่อระบบฐานข้อมูล MongoDB ใน PC สำเร็จแล้ว!');
    } catch (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB ได้ กรุณาเปิดโปรแกรม MongoDB Community ในเครื่องก่อนครับ:', err.message);
        process.exit(1); // ปิดระบบหากเชื่อมต่อฐานข้อมูลไม่ได้
    }
};

// 👤 1. โครงสร้างตารางจัดเก็บข้อมูลสมาชิก (User Schema)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    acceptedTerms: { type: Boolean, default: false }, // เก็บสถานะการกดยอมรับเงื่อนไขใช้งาน
    avatar: { type: String, default: '' },            // เส้นทางไฟล์รูปโปรไฟล์ใน PC
    albums: [{ type: String }],                       // อาร์เรย์เก็บพาธรูปภาพในอัลบั้มทั้งหมด
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 💬 2. โครงสร้างตารางจัดเก็บข้อความแชทส่วนตัว (Private Message Schema)
const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },         // ชื่อผู้ส่ง
    target: { type: String, required: true },         // ชื่อผู้รับ
    message: { type: String, required: true },        // ตัวข้อความสนทนา
    isRead: { type: Boolean, default: false },        // จุดแจ้งเตือนสีแดงทางขวา
    createdAt: { type: Date, default: Date.now }
});

// แปลงโครงสร้างข้อมูลให้เป็น Model พร้อมใช้งาน
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// 📦 จัดการส่งออกโมดูลเพื่อนำไปเชื่อมใช้งานร่วมกับ server.js หลัก
module.exports = {
    connectDB,
    User,
    Message
};
