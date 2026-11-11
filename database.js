const mongoose = require('mongoose');

// 🟢 ระบุที่อยู่ฐานข้อมูลในเครื่อง PC ของคุณ (รันผ่าน Port มาตรฐาน 27017)
const mongoURI = 'mongodb://127.0.0.1:27017/pinggo_db';

// ฟังก์ชันสั่งเชื่อมต่อไปยังโปรแกรม MongoDB ในคอมพิวเตอร์
const connectDB = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('🗄️ [PingGo DB] เชื่อมต่อระบบฐานข้อมูล MongoDB ใน PC สำเร็จแล้ว!');
    } catch (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ MongoDB ได้ กรุณาเปิดโปรแกรม MongoDB Community ในเครื่องก่อนครับ:', err.message);
        process.exit(1);
    }
};

// 👤 1. [ปรับปรุงใหม่] โครงสร้างตารางจัดเก็บข้อมูลและรหัสผ่านสมาชิกทุกคนไว้ที่ PC
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },               // เพิ่มฟิลด์เก็บรหัสผ่านเข้าสู่ระบบ
    acceptedTerms: { type: Boolean, default: false },
    avatar: { type: String, default: '' },
    albums: [{ type: String }],
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 💬 2. โครงสร้างตารางจัดเก็บข้อความแชทส่วนตัว 1 ต่อ 1
const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    target: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: String, required: true },                    // ฟิลด์เก็บเวลาส่งข้อความ
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = {
    connectDB,
    User,
    Message
};

// 👤 1. เส้นทางระบบสำหรับสมัครสมาชิกใหม่ (Register API)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วนค่ะ' });
        }

        // ตรวจสอบว่ามีชื่อผู้ใช้งานนี้ลงทะเบียนอยู่ในเครื่อง PC ของคุณแล้วหรือยัง
        const userExists = await User.findOne({ username: username });
        if (userExists) {
            return res.status(400).json({ success: false, error: 'ชื่อผู้ใช้งานนี้มีคนใช้แล้วค่ะ ❌' });
        }

        // สร้างข้อมูลสมาชิกใหม่และบันทึกลง MongoDB ในคอมพิวเตอร์ของคุณ
        const newUser = new User({
            username: username,
            password: password, // เก็บแบบข้อความธรรมดาตามโครงสร้างปัจจุบันของคุณ
            acceptedTerms: true
        });
        await newUser.save();

        res.json({ success: true, message: 'ลงทะเบียนสมัครสมาชิกสำเร็จเรียบร้อยแล้วค่ะ! 🎉' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'ระบบหลังบ้านทำงานผิดพลาด: ' + err.message });
    }
});

// 🔑 2. เส้นทางระบบสำหรับเข้าสู่ระบบเช็กรหัสผ่าน (Login API)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วนค่ะ' });
        }

        // ค้นหาบัญชีผู้ใช้ใน MongoDB ของ PC
        const user = await User.findOne({ username: username });
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้องค่ะ ❌' });
        }

        res.json({ success: true, username: user.username, message: 'เข้าสู่ระบบสำเร็จแล้วค่ะ' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'ระบบหลังบ้านทำงานผิดพลาด: ' + err.message });
    }
});

        
