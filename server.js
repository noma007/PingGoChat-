const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');

// ดึงระบบฐานข้อมูล และ ฟังก์ชันอัปโหลดรูปภาพเข้ามาใช้งานร่วมกัน
const { connectDB, User, Message } = require('./database');
const upload = require('./upload');

// สั่งให้เชื่อมต่อไปยังโปรแกรม MongoDB ในเครื่อง PC ของคุณทันทีเมื่อเปิดระบบ
connectDB();

// 🟢 ตั้งค่าเชื่อมต่อระบบ Socket.io รองรับการส่งแชทสด
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // อนุญาตให้ทุกอุปกรณ์เข้าถึงหน้าเว็บได้ฟรี
    methods: ["GET", "POST"]
  }
});

// ตารางจัดเก็บข้อมูลผู้ใช้ที่กำลังเปิดเบราว์เซอร์แชทออนไลน์อยู่ ณ ปัจจุบัน
let activeUsers = {}; 

// ปล่อยให้สิทธิ์การเปิดอ่านไฟล์หน้าบ้านในโฟลเดอร์ public ทำงานได้
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// =========================================================================
// 🎯 1. [วางต่อท้าย] ปลดล็อกสิทธิ์ความปลอดภัยเครือข่าย (CSP Bypass)
// เพื่ออนุญาตให้เบราว์เซอร์ส่งข้อความสด และคุยกับฐานข้อมูลในคอม PC ได้โดยไม่โดนบล็อก
// =========================================================================
 app.use((req, res, next) => {
    // 1. สั่งลบกฎ Content-Security-Policy ที่ขึ้นค่า 'none' ทิ้งไปเพื่อไม่ให้เบราว์เซอร์สกัดสัญญาณ
    res.removeHeader("Content-Security-Policy");
    
    // 2. ประกาศสิทธิ์ชุดใหม่เปิดท่อส่งข้อมูลสด (Bypass) ให้เข้าออกพอร์ต 3000 ได้อิสระ
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline' ws: wss:; img-src * data: blob:; style-src * 'unsafe-inline';");
    
    // 3. ปลดล็อกระบบรักษาความปลอดภัยข้ามโดเมน (CORS) เพิ่มเติม
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    next();
});

   // เปลี่ยนจุดนี้ใน server.js ของคุณเพื่อให้รันเปิดหน้าล็อกอินดาร์กโหมดตัวนี้ขึ้นมาก่อนเพื่อนครับ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// =========================================================================
// 🎯 2. [วางต่อท้าย] ระบบสลับเราเตอร์แชทกลุ่มย่อย บันทึกลง MongoDB PC ถาวร
// =========================================================================
io.on('connection', (socket) => {
  console.log('🔌 [PingGo] มีอุปกรณ์เชื่อมต่อ Socket ID: ' + socket.id);

  // ระบบดักฟังปุ่มสมัครสมาชิก/ล็อกอินบันทึกลง PC ยืนยันตัวตน
  socket.on('register_and_login', async (data) => {
    const username = data.username;
    activeUsers[username] = socket.id; // ผูกไอดีไว้ในคลังหน่วยความจำคอมพิวเตอร์
    console.log(`👤 ผู้ใช้ [ ${username} ] ลงทะเบียนสมาชิกใน PC สำเร็จ`);

    try {
        // บันทึกและอัปเดตสถานะออนไลน์เข้าสู่ฐานข้อมูล MongoDB จริงๆ
        await User.findOneAndUpdate(
            { username: username }, 
            { isOnline: true }, 
            { upsert: true, new: true }
        );
        socket.emit('login_success', { username: username });
        await broadcastAllMembers(); // รีเฟรชรายชื่อส่งกลับไปบอร์ดกลาง
    } catch (err) {
        console.error('❌ สมัครสมาชิกล้มเหลว:', err.message);
    }
  });

     // 🎯 [แก้ไขแทนที่ทั้งหมด] ระบบแชทส่วนตัว 1 ต่อ 1 ส่งให้ใคร คนนั้นเห็นคนเดียว 100%
  socket.on('send_multicast_message', async (data) => {
    // รับข้อมูล: คนส่ง, targets (อาร์เรย์ที่มีชื่อคนรับแค่คนเดียวจากการที่เราคลิกคุย), และข้อความ
    const { sender, targets, message } = data; 
    
    // ดึงชื่อผู้รับตัวจริงคนเดียวออกมาจากอาร์เรย์ (เช่น ถ้าคลิกคุยกับพี่โต ก็จะได้ชื่อพี่โตคนเดียว)
    const realTarget = (Array.isArray(targets) && targets.length > 0) ? targets[0] : targets;

    if (!realTarget) return console.log("⚠️ ไม่พบชื่อผู้รับข้อความส่วนตัว");

    console.log(`🔒 [Private Link] ${sender} กำลังส่งแชทส่วนตัวหา -> ${realTarget}`);

    // 🗄️ 1. บันทึกประวัติแชทลง MongoDB PC แบบระบุคู่สนทนาตัวต่อตัวเด็ดขาด (คนอื่นไม่มีสิทธิ์เห็น)
    const privateChatMessage = new Message({
        sender: sender,
        targets: [realTarget], // บันทึกชื่อผู้รับคนนี้คนเดียวลงฐานข้อมูล
        message: message
    });

    try {
        await privateChatMessage.save();
        console.log(`💾 [MongoDB Saved] บันทึกแชทส่วนตัวคู่สนทนา [ ${sender} ] กับ [ ${realTarget} ] เรียบร้อย`);

        // ⚡ 2. ยิงสัญญาณสด Real-time ส่งตรงเข้าเบราว์เซอร์ของผู้รับคนนี้คนเดียวเท่านั้น!
        const targetSocketId = activeUsers[realTarget];
        if (targetSocketId) {
            // ยิงสัญญาณเจาะจงไปที่ Socket ID ของผู้รับคนเดียว คนอื่นในระบบจะไม่มีทางได้รับข้อความนี้
            io.to(targetSocketId).emit('receive_multicast_message', {
                sender: sender,
                message: message,
                targets: [realTarget]
            });
        }
    } catch (err) {
        console.error('❌ ระบบหลังบ้านบันทึกแชทส่วนตัวผิดพลาด:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    for (let username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        delete activeUsers[username];
        try {
            await User.findOneAndUpdate({ username: username }, { isOnline: false });
            await broadcastAllMembers();
        } catch (err) { console.error(err); }
        break;
      }
    }
  });
});


// 🌐 เปิดหน้าแรกของเว็บเมื่อมีการเรียกเข้าหน้าแอป
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

// 👥 ฟังก์ชันสำหรับดึงรายชื่อสมาชิกทุกคนจากฐานข้อมูลใน PC ส่งไปอัปเดตที่หน้าจอของทุกคน
async function broadcastAllMembers() {
    try {
        const allUsers = await User.find({}, 'username isOnline avatar').sort({ createdAt: -1 });
        io.emit('sync_all_members', allUsers);
    } catch (err) {
        console.error('❌ ไม่สามารถดึงรายชื่อสมาชิกมาอัปเดตได้:', err.message);
    }
}

// ดักฟังเมื่อมีผู้ใช้งานเชื่อมต่อระบบเครือข่ายเข้ามา (Network Connection)
io.on('connection', (socket) => {
  console.log('🔌 มีอุปกรณ์เชื่อมต่อเข้ามา รหัส Socket ID: ' + socket.id);

  // 3. [ระบบสมัครสมาชิก/ล็อกอิน] บันทึกข้อมูลสมาชิกลงฐานข้อมูล MongoDB ในเครื่อง PC จริงๆ
  socket.on('register_and_login', async (data) => {
    const username = data.username;
    activeUsers[username] = socket.id; // ผูก Socket ID ปัจจุบันไว้ในหน่วยความจำ
    console.log(`👤 ผู้ใช้ [ ${username} ] สมัครสมาชิก/เข้าสู่ระบบสำเร็จ`);

    try {
        // ใช้คำสั่ง upsert: ถ้ายังไม่มีชื่อใน PC ให้สร้างใหม่ (สมัครสมาชิก) / ถ้ามีแล้วให้อัปเดตสถานะออนไลน์
        await User.findOneAndUpdate(
            { username: username }, 
            { isOnline: true, acceptedTerms: true }, 
            { upsert: true, new: true }
        );
        
        // 🎯 ส่งสัญญาณแจ้งหน้าบ้านว่าล็อกอินสำเร็จ พร้อมส่งชื่อผู้ใช้กลับไป
        socket.emit('login_success', { username: username });
        
        // ส่งรายชื่อสมาชิกทุกคนในระบบ (ทั้งออนไลน์และออฟไลน์) ไปแสดงผลที่หน้าเว็บหลักทันที
        await broadcastAllMembers();
    } catch (err) {
        console.error('❌ บันทึกข้อมูลสมาชิกลงฐานข้อมูลล้มเหลว:', err.message);
    }
  });

  // 1. [ระบบส่งข้อความแชทกระจาย] ส่งหาคนที่เราเลือก และอัปเดตประวัติการคุยล่าสุด
  socket.on('send_multicast_message', async (data) => {
    const { sender, targets, message } = data; // targets จะส่งมาเป็น Array รายชื่อ เช่น ['น้องส้ม', 'พี่โต']

    // เตรียมข้อมูลประวัติการสนทนาเพื่อบันทึกลง PC
    const newChat = new Message({
        sender: sender,
        targets: targets, // บันทึกรายชื่อผู้รับทุกคนที่ถูกเลือกไว้ในรอบนี้
        message: message
    });

    try {
        // 🗄️ บันทึกข้อความแชทเก็บถาวรไว้ที่ฐานข้อมูลใน PC ของคุณ
        await newChat.save();
        console.log(`💾 บันทึกประวัติ: [ ${sender} ] -> ส่งหา [ ${targets.join(', ')} ]: "${message}"`);

        // วนลูปส่งสัญญาณสดหาผู้รับทุกคนที่คุณเลือกไว้ในหน้าต่างแชทพร้อมกัน แบบ Real-time
        targets.forEach(target => {
            const targetSocketId = activeUsers[target];
            if (targetSocketId) {
                io.to(targetSocketId).emit('receive_multicast_message', {
                    sender: sender,
                    message: message
                });
            }
        });
    } catch (err) {
        console.error('❌ ไม่สามารถบันทึกประวัติข้อความลงคอมได้:', err.message);
    }
  });

  // จัดการระบบเมื่อสมาชิกปิดเบราว์เซอร์หรือตัดการเชื่อมต่อ
  socket.on('disconnect', async () => {
    for (let username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        console.log(`❌ ผู้ใช้ [ ${username} ] ตัดการเชื่อมต่อ ออกจากระบบแล้ว`);
        delete activeUsers[username]; // ลบรายชื่อออกจากหน่วยความจำคอมพิวเตอร์
        
        try {
            // อัปเดตสถานะในฐานข้อมูลบน PC ให้เป็นออฟไลน์
            await User.findOneAndUpdate({ username: username }, { isOnline: false });
            // ส่งสัญญาณอัปเดตสถานะรายชื่อให้ทุกคนบนหน้าเว็บเห็น
            await broadcastAllMembers();
        } catch (err) {
            console.error('❌ ไม่สามารถอัปเดตสถานะออฟไลน์ได้:', err.message);
        }
        break;
      }
    }
  });
});

// รันระบบเซิร์ฟเวอร์ใน PC ของคุณผ่าน Port 3000 คอยสแตนด์บายเชื่อมต่อกับอินเทอร์เน็ตภายนอก
const PORT = 3000;
http.listen(PORT, () => {
  console.log(`🚀 [PingGoChat SV v1.2.0] ทำงานสมบูรณ์แล้วบนพอร์ตแลนเครื่องคุณ -> Port: ${PORT}`);
});
