const mongoose = require('mongoose');

// 🟢 ระบุที่อยู่ฐานข้อมูลในเครื่อง PC ของคุณ (รันผ่าน Port มาตรฐาน 27017)
// และตั้งชื่อฐานข้อมูลในเครื่องคอมว่า pinggo_db
const mongoURI = 'mongodb://127.0.0.1:27017/pinggo_db';

// ฟังก์ชันสั่งเชื่อมต่อไปยังโปรแกรม MongoDB ในคอมพิวเตอร์
const connectDB = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('🗄️ [PingGo DB] เชื่อมต่อระบบฐานข้อมูลเพื่อเก็บสมาชิกสำเร็จ!');
    } catch (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB ได้ กรุณาเปิดโปรแกรม MongoDB Community ในเครื่องก่อนครับ:', err.message);
        process.exit(1); // ปิดระบบหากเชื่อมต่อฐานข้อมูลไม่ได้
    }
};

// 👤 1. [แก้ไขทั้งหมด] โครงสร้างตารางจัดเก็บข้อมูลสมาชิกทุกคนไว้ที่ PC (User Schema)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    acceptedTerms: { type: Boolean, default: true }, // เก็บสถานะการกดยอมรับเงื่อนไขใช้งาน
    avatar: { type: String, default: '' },            // เส้นทางไฟล์รูปโปรไฟล์ใน PC
    albums: [{ type: String }],                       // อาร์เรย์เก็บพาธรูปภาพในอัลบั้มทั้งหมด
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 💬 2. [แก้ไขทั้งหมด] โครงสร้างตารางจัดเก็บข้อความแชท (รองรับการระบุผู้รับพร้อมกันหลายคน)
const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },         // ชื่อผู้ส่ง
    targets: [{ type: String, required: true }],      // [แก้ไข] เปลี่ยนเป็น Array เพื่อเก็บชื่อผู้รับทุกคน (เช่น 1 คน หรือ 2 คนพร้อมกัน)
    message: { type: String, required: true },        // ตัวข้อความสนทนา
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



        
