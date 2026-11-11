const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');

// ดึงระบบฐานข้อมูล และ ฟังก์ชันอัปโหลดรูปภาพเข้ามาใช้งานร่วมกัน
const { connectDB, User, Message } = require('./database');
const upload = require('./upload');

// สั่งให้เชื่อมต่อไปยังโปรแกรม MongoDB ในเครื่อง PC ของคุณทันทีเมื่อเปิดระบบ
connectDB();


// 🟢 ตั้งค่าเชื่อมต่อระบบ Socket.io รองรับการส่งแชทสดจากภายนอกบ้าน
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // อนุญาตให้ทุกอุปกรณ์เข้าถึงหน้าเว็บได้ฟรี
    methods: ["GET", "POST"]
  }
});

// ตารางจัดเก็บข้อมูลผู้ใช้ที่กำลังแชทออนไลน์อยู่บน PC ของคุณ
let activeUsers = {}; 

// ปล่อยให้สิทธิ์การเปิดอ่านไฟล์หน้าบ้านในโฟลเดอร์ public ทำงานได้
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 🌐 เปิดหน้าแรกของเว็บเมื่อมีคนกรอกลิงก์ pinggochat.duckdns.org:3000
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🖼️ ช่องทาง (API) สำหรับให้สมาชิกกดอัปโหลดรูปภาพเข้าอัลบั้มโปรไฟล์
app.post('/api/upload-album', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพก่อนค่ะ' });
        
        const username = req.body.username; // ดึงชื่อเจ้าของโปรไฟล์
        const fileUrl = `/uploads/albums/${req.file.filename}`; // พาธรูปภาพที่เซฟในเครื่อง PC

        // บันทึกที่อยู่รูปภาพลงคลังอาร์เรย์ albums ของผู้ใช้ในฐานข้อมูล MongoDB
        await User.findOneAndUpdate({ username: username }, { $push: { albums: fileUrl } });

        res.json({ success: true, url: fileUrl });
    } catch (err) {
        res.status(500).json({ error: 'ระบบเซิร์ฟเวอร์ PC อัปโหลดผิดพลาด: ' + err.message });
    }
});


// ดักฟังเมื่อมีผู้ใช้งานเชื่อมต่อระบบเครือข่ายเข้ามา (Network Connection)
io.on('connection', (socket) => {
  console.log('🔌 มีอุปกรณ์เชื่อมต่อเข้ามา รหัส Socket ID: ' + socket.id);

         // 1. [แก้ไขแล้ว] รับสัญญาล็อกอิน: บันทึกข้อมูลสมาชิกลงฐานข้อมูล MongoDB ในเครื่อง PC จริงๆ
  socket.on('user_connected', async (data) => {
    const username = data.username;
    activeUsers[username] = socket.id; // ผูก Socket ID ปัจจุบันไว้ในหน่วยความจำ
    console.log(`👤 ผู้ใช้ [ ${username} ] ออนไลน์และสแตนด์บายรับข้อความส่วนตัว`);

    try {
        // ใช้คำสั่ง upsert: ถ้ายังไม่มีชื่อใน PC ให้สร้างใหม่ / ถ้ามีแล้วให้อัปเดตสถานะออนไลน์
        await User.findOneAndUpdate(
            { username: username }, 
            { isOnline: true, acceptedTerms: true }, 
            { upsert: true, new: true }
        );
        
        socket.emit('login_success', { userId: socket.id });
        
        // ยิงรายชื่อคนที่ออนไลน์อยู่ทั้งหมดส่งไปอัปเดตบนหน้าจอทุกคน
        io.emit('update_online_list', Object.keys(activeUsers));
    } catch (err) {
        console.error('❌ บันทึกสมาชิกสมาชิกลงฐานข้อมูลล้มเหลว:', err.message);
    }
  });

  // 2. [แก้ไขแล้ว] ระบบส่งข้อความแชทส่วนตัวเจาะจงบุคคลและเซฟประวัติลงฐานข้อมูลใน PC
  socket.on('send_private_message', async (data) => {
    const { sender, target, message } = data;
    const targetSocketId = activeUsers[target]; // ควานหารหัสเชื่อมต่อของคนรับปลายทาง
    
    const timeNow = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    // เตรียมก้อนข้อมูลประวัติการสนทนาเพื่อบันทึกลง PC
    const newChat = new Message({
        sender: sender,
        target: target,
        message: message,
        time: timeNow
    });

    try {
        // 💾 บันทึกข้อความแชท 1 ต่อ 1 เก็บถาวรไว้ที่ฐานข้อมูลใน PC ของคุณ
        await newChat.save();
        console.log(`💾 บันทึกประวัติ: [ ${sender} ] -> [ ${target} ]: "${message}"`);

        // 🎯 ส่งสัญญาณสด: ยิงข้อความเข้าหน้าจอเฉพาะคนที่เราเจาะจงทักคุย (คนอื่นอีก 2 คนจะไม่มีสิทธิ์เห็นข้อความนี้)
        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_private_message', {
                sender: sender,
                message: message,
                time: timeNow
            });
        }
    } catch (err) {
        console.error('❌ ไม่สามารถบันทึกประวัติข้อความลงคอมได้:', err.message);
    }
  });


      // 3. จัดการระบบเมื่อสมาชิกปิดเบราว์เซอร์หรือตัดการเชื่อมต่อ
  socket.on('disconnect', () => {
    for (let username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        console.log(`❌ ผู้ใช้ [ ${username} ] ออฟไลน์ ออกจากระบบแล้ว`);
        delete activeUsers[username]; // ลบรายชื่อออกจากหน่วยความจำคอมพิวเตอร์
        break;
      }
    }
  });
});

// รันระบบเซิร์ฟเวอร์ใน PC ของคุณผ่าน Port 3000 คอยสแตนด์บายเชื่อมต่อกับอินเทอร์เน็ตภายนอก
const PORT = 3000;
http.listen(PORT, () => {
  console.log(`🚀 [PingGoChat SV] ทำงานสมบูรณ์แล้วบนพอร์ตแลนเครื่องคุณ -> Port: ${PORT}`);
  console.log(`🔗 เปิดเราเตอร์ Port Forwarding ไปยังพอร์ตนี้เพื่อเชื่อมระบบเข้ากับ pinggochat.duckdns.org`);
});
