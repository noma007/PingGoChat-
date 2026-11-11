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

      // 1. รับข้อมูลเมื่อสมาชิกล็อกอินและยอมรับเงื่อนไขผ่านหน้าจอมาแล้ว
  socket.on('user_connected', (data) => {
    const username = data.username;
    
    // ผูกชื่อผู้ใช้งานเข้ากับรหัส Socket ID เครื่องนั้นๆ ในหน่วยความจำ PC
    activeUsers[username] = socket.id;
    console.log(`👤 ผู้ใช้ [ ${username} ] ติ๊กยอมรับเงื่อนไขและออนไลน์แล้ว`);
    
    // ยิงคำสั่งตอบกลับเพื่อแจ้งหน้าบ้านว่าบันทึกบนเซิร์ฟเวอร์ PC สำเร็จ
    socket.emit('login_success', { userId: socket.id });
  });

  // 2. ระบบส่งข้อความแชทส่วนตัว (Private Message) แบบ 1 ต่อ 1
  socket.on('send_private_message', (data) => {
    const { sender, target, message } = data;
    const targetSocketId = activeUsers[target]; // ค้นหาช่องทางติดต่อของคนรับปลายทาง

    const chatPacket = {
      sender: sender,
      message: message
    };

    console.log(`💬 แชทส่วนตัว: [ ${sender} ] ส่งหา [ ${target} ] -> "${message}"`);

    // ถ้าเพื่อนปลายทางกำลังออนไลน์บนเว็บอยู่ ให้ยิงข้อความส่วนตัวเข้าจอเขาโดยตรงทันที
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_private_message', chatPacket);
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
