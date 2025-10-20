const express = require('express');
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const PYTHON_API = process.env.PYTHON_API || 'http://localhost:5050';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セキュリティ・互換性用ヘッダー
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// フロントエンド：ホーム画面
app.get('/', (req, res) => {
  res.send(`
    <h2>YouTube 音声ストリーミング 🎧</h2>
    <form id="playForm">
      <input type="text" name="url" id="urlInput" placeholder="YouTubeのURL" required style="width: 80%">
      <button type="submit">再生開始</button>
    </form>
    <div id="playerContainer" style="display: none; margin-top: 20px;">
      <h3 id="trackTitle">🎵 再生中：</h3>
      <audio id="player" controls autoplay style="width: 100%"></audio>
    </div>
    <script>
      const form = document.getElementById('playForm');
      const urlInput = document.getElementById('urlInput');
      const audio = document.getElementById('player');
      const title = document.getElementById('trackTitle');
      const playerContainer = document.getElementById('playerContainer');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ytUrl = urlInput.value;
        try {
          const res = await fetch('/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ytUrl })
          });
          const data = await res.json();
          const playlist = data.tracks;
          if (!playlist || playlist.length === 0) {
            alert('音声URLが取得できませんでした');
            return;
          }
          playerContainer.style.display = 'block';
          let index = 0;
          function play(i) {
            const track = playlist[i];
            audio.src = "/stream?url=" + encodeURIComponent(track.url);
            title.innerText = "🎵 再生中：" + track.title;
            audio.play();
          }
          audio.addEventListener('ended', () => {
            index++;
            if (index < playlist.length) {
              play(index);
            }
          });
          play(index);
        } catch (err) {
          alert('エラーが発生しました: ' + err.message);
        }
      });
    </script>
  `);
});

// YouTube URL → PythonのAPIにPOST
app.post('/play', async (req, res) => {
  const ytUrl = req.body.url;
  if (!ytUrl) return res.status(400).json({ error: 'URLが未入力です' });

  try {
    const response = await axios.post(`${PYTHON_API}/get-audio`, { url: ytUrl });
    const tracks = response.data.tracks;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ error: '音声URLが取得できませんでした' });
    }
    res.json({ tracks });
  } catch (err) {
    console.error('[Python連携エラー]:', err.message);
    res.status(500).json({ error: '音声取得に失敗しました' });
  }
});

// 音声ストリーミング：ffmpegでリダイレクト
app.get('/stream', (req, res) => {
  const audioUrl = req.query.url;
  if (!audioUrl) return res.status(400).send('Missing audio URL');

  const ffmpeg = spawn('ffmpeg', [
    '-re',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', audioUrl,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', (data) => {
    console.error('[ffmpeg stderr]:', data.toString());
  });

  ffmpeg.on('close', (code) => {
    if (code !== 0) {
      console.error(`ffmpeg exited with code ${code}`);
    }
    res.end();
  });
});

app.listen(PORT, () => {
  console.log(`✅ Node.js running on http://localhost:${PORT}`);
});
