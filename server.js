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

// เปิดสิทธิ์การเข้าถึงไฟล์หน้าบ้านในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 🌐 เปิดหน้าแรกของเว็บเมื่อมีการเข้าใช้งาน
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🖼️ ช่องทาง (API) สำหรับให้สมาชิกกดอัปโหลดรูปภาพเข้าอัลบั้มโปรไฟล์
app.post('/api/upload-album', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพก่อนค่ะ' });
        
        const username = req.body.username;
        const fileUrl = `/uploads/albums/${req.file.filename}`;

        await User.findOneAndUpdate({ username: username }, { $push: { albums: fileUrl } });
        res.json({ success: true, url: fileUrl });
    } catch (err) {
        res.status(500).json({ error: 'ระบบเซิร์ฟเวอร์ PC อัปโหลดผิดพลาด: ' + err.message });
    }
});

// 🔌 ดักฟังเมื่อมีผู้ใช้งานเชื่อมต่อระบบเครือข่ายเข้ามา
io.on('connection', (socket) => {
  console.log('🔌 มีอุปกรณ์เชื่อมต่อเข้ามา รหัส Socket ID: ' + socket.id);

  // 📝 [เพิ่มใหม่] รับสัญญาสมัครสมาชิก: ตรวจสอบความซ้ำและบันทึกลงฐานข้อมูลในเครื่อง PC
  socket.on('register_user', async (data) => {
    const { username, password } = data;
    try {
        const existingUser = await User.findOne({ username: username });
        if (existingUser) {
            return socket.emit('register_result', { success: false, error: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้วค่ะ' });
        }

        const newUser = new User({
            username: username,
            password: password, // บันทึกแบบข้อความตรงเพื่อความง่ายในการพัฒนาในเครื่อง
            acceptedTerms: true
        });
        await newUser.save();
        
        console.log(`✨ [สมัครสมาชิก] บัญชีใหม่ [ ${username} ] บันทึกลง PC สำเร็จ`);
        socket.emit('register_result', { success: true });
    } catch (err) {
        socket.emit('register_result', { success: false, error: 'ผิดพลาด: ' + err.message });
    }
  });

  // 🔐 [ปรับปรุงใหม่] รับสัญญาล็อกอิน: ตรวจสอบรหัสผ่านกับข้อมูลจริงบน MongoDB
  socket.on('user_connected', async (data) => {
    const { username, password } = data;
    try {
        const user = await User.findOne({ username: username });
        
        if (!user) {
            return socket.emit('login_fail', { error: 'ไม่พบชื่อบัญชีนี้ กรุณาสมัครสมาชิกก่อนค่ะ' });
        }
        if (user.password !== password) {
            return socket.emit('login_fail', { error: 'รหัสผ่านไม่ถูกต้อง กรุณากรอกใหม่อีกครั้งค่ะ' });
        }

        activeUsers[username] = socket.id;
        console.log(`👤 ผู้ใช้ [ ${username} ] ล็อกอินผ่านฐานข้อมูลในคอมสำเร็จ`);

        user.isOnline = true;
        await user.save();
        
        socket.emit('login_success', { userId: socket.id });
        io.emit('update_online_list', Object.keys(activeUsers));
    } catch (err) {
        console.error('❌ ระบบฐานข้อมูลขัดข้อง:', err.message);
        socket.emit('login_fail', { error: 'ระบบหลังบ้านขัดข้อง' });
    }
  });

  // 💬 [ปรับปรุงใหม่ตามข้อ 1] ส่งแชทให้ 1 คน แต่อีก 2 คนที่เกี่ยวข้องได้ยินข้อความด้วย (แชทแบบกลุ่ม/รูม)
  socket.on('send_private_message', async (data) => {
    const { sender, target, message } = data;
    const timeNow = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const newChat = new Message({
        sender: sender,
        target: target,
        message: message
    });

    try {
        await newChat.save();
        console.log(`💾 บันทึกประวัติลง PC: [ ${sender} ] -> [ ${target} ]: "${message}"`);

        // 🎯 ยิงสัญญาณแบบ Broadcast แอบส่งให้คนที่เลือกตรง ๆ คุยกัน 1 ต่อ 1
        const targetSocketId = activeUsers[target];
        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_private_message', { sender, message, time: timeNow });
        }

        // 🤫 [ฟังก์ชันแอบดักฟังตามโจทย์] หากในระบบมีคนชื่อ "แอบฟัง1" และ "แอบฟัง2" ออนอยู่ จะได้ข้อความนี้ไปด้วย
        const spyList = ['แอบฟัง1', 'แอบฟัง2']; 
        spyList.forEach(spyName => {
            const spySocketId = activeUsers[spyName];
            if (spySocketId && spyName !== sender && spyName !== target) {
                io.to(spySocketId).emit('receive_private_message', {
                    sender: `${sender} (แอบคุยกับ ${target})`,
                    message: message,
                    time: timeNow
                });
            }
        });

    } catch (err) {
        console.error('❌ บันทึกประวัติข้อความล้มเหลว:', err.message);
    }
  });

  // ❌ จัดการระบบเมื่อสมาชิกปิดเบราว์เซอร์หรือตัดการเชื่อมต่อ
  socket.on('disconnect', async () => {
    for (let username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        console.log(`❌ ผู้ใช้ [ ${username} ] ออฟไลน์ ออกจากระบบแล้ว`);
        delete activeUsers[username];
        
        await User.findOneAndUpdate({ username: username }, { isOnline: false });
        io.emit('update_online_list', Object.keys(activeUsers));
        break;
      }
    }
  });
});

// รันระบบเซิร์ฟเวอร์บนเครื่อง PC ผ่าน Port 3000
const PORT = 3000;
http.listen(PORT, () => {
  console.log(`🚀 [PingGoChat SV] ทำงานสมบูรณ์แล้วบนพอร์ต -> Port: ${PORT}`);
});
