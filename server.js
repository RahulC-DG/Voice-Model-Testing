const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const { CartesiaClient } = require("@cartesia/cartesia-js");
const { RealtimeClient } = require("@speechmatics/real-time-client");
const { createSpeechmaticsJWT } = require("@speechmatics/auth");
const speech = require('@google-cloud/speech');
const dotenv = require("dotenv");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

dotenv.config();

const client = createClient(process.env.DEEPGRAM_API_KEY);

// AssemblyAI API Key for Universal Streaming v3
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Cartesia API Key for Ink-Whisper STT
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;

// Speechmatics API Key
const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY;

// Google Cloud Speech API Key
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Initialize Cartesia client
const cartesiaClient = new CartesiaClient({
  apiKey: CARTESIA_API_KEY,
});

// Initialize Google Speech client with API key authentication
const googleSpeechClient = new speech.SpeechClient({
  apiKey: GOOGLE_API_KEY,
});

const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    // Accept audio and video files
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio and video files are allowed!'), false);
    }
  }
});

app.use(express.static("public/"));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// File upload endpoint
app.post("/upload", upload.array('files', 10), (req, res) => {
  try {
    const uploadedFiles = req.files.map(file => ({
      id: file.filename,
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      path: file.path
    }));
    
    console.log(`Uploaded ${uploadedFiles.length} files`);
    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Audio processing endpoint
app.post("/process-audio", async (req, res) => {
  try {
    const { fileId, referenceTranscript } = req.body;
    const filePath = path.join(uploadsDir, fileId);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Convert to PCM16 format for consistent processing
    const outputPath = path.join(uploadsDir, `processed-${fileId}.wav`);
    
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Read the processed audio file
    const audioBuffer = fs.readFileSync(outputPath);
    
    // Initialize transcription results
    let deepgramResult = '';
    let assemblyResult = '';
    let deepgramError = null;
    let assemblyError = null;

    // Process with Deepgram
    try {
      const dgResponse = await client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: "nova-3",
          smart_format: true,
        }
      );
      
      if (dgResponse.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
        deepgramResult = dgResponse.result.results.channels[0].alternatives[0].transcript;
      }
    } catch (error) {
      console.error('Deepgram processing error:', error);
      deepgramError = error.message;
    }

    // Process with AssemblyAI (prerecorded API for files)
    try {
      // Upload file to AssemblyAI
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/octet-stream'
        },
        body: audioBuffer
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`AssemblyAI upload failed: ${uploadResponse.statusText}`);
      }
      
      const uploadData = await uploadResponse.json();
      
      // Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: uploadData.upload_url
        })
      });
      
      if (!transcriptResponse.ok) {
        throw new Error(`AssemblyAI transcription request failed: ${transcriptResponse.statusText}`);
      }
      
      const transcriptData = await transcriptResponse.json();
      
      // Poll for completion
      let pollAttempts = 0;
      const maxAttempts = 60; // 5 minutes timeout
      
      while (pollAttempts < maxAttempts) {
        const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
          headers: {
            'authorization': ASSEMBLYAI_API_KEY
          }
        });
        
        const statusData = await statusResponse.json();
        
        if (statusData.status === 'completed') {
          assemblyResult = statusData.text || '';
          break;
        } else if (statusData.status === 'error') {
          throw new Error(`AssemblyAI transcription failed: ${statusData.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        pollAttempts++;
      }
      
      if (pollAttempts >= maxAttempts) {
        throw new Error('AssemblyAI transcription timeout');
      }
      
    } catch (error) {
      console.error('AssemblyAI processing error:', error);
      assemblyError = error.message;
    }

    // Calculate WER if reference transcript is provided
    let werResults = null;
    if (referenceTranscript && referenceTranscript.trim()) {
      werResults = {
        reference: referenceTranscript.trim(),
        deepgramWER: deepgramResult ? calculateWER(referenceTranscript.trim(), deepgramResult) : null,
        assemblyWER: assemblyResult ? calculateWER(referenceTranscript.trim(), assemblyResult) : null
      };
    }

    // Clean up temporary files
    try {
      fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary file:', cleanupError);
    }

    res.json({
      success: true,
      results: {
        deepgram: {
          transcript: deepgramResult,
          error: deepgramError
        },
        assembly: {
          transcript: assemblyResult,
          error: assemblyError
        },
        wer: werResults
      }
    });

  } catch (error) {
    console.error('Audio processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to calculate Word Error Rate
function calculateWER(reference, hypothesis) {
  const refWords = reference.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const hypWords = hypothesis.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  const dp = Array(refWords.length + 1).fill(null).map(() => Array(hypWords.length + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= refWords.length; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= hypWords.length; j++) {
    dp[0][j] = j;
  }
  
  // Fill the DP table
  for (let i = 1; i <= refWords.length; i++) {
    for (let j = 1; j <= hypWords.length; j++) {
      if (refWords[i-1] === hypWords[j-1]) {
        dp[i][j] = dp[i-1][j-1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i-1][j],    // deletion
          dp[i][j-1],    // insertion
          dp[i-1][j-1]   // substitution
        );
      }
    }
  }
  
  const wer = (dp[refWords.length][hypWords.length] / refWords.length) * 100;
  return Math.round(wer * 100) / 100; // Round to 2 decimal places
}

// Delete file endpoint
app.delete("/upload/:fileId", (req, res) => {
  try {
    const filePath = path.join(uploadsDir, req.params.fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const getProjectId = async () => {
  const { result, error } = await client.manage.getProjects();

  if (error) {
    throw error;
  }

  return result.projects[0].project_id;
};

const getTempApiKey = async (projectId) => {
  const { result, error } = await client.manage.createProjectKey(projectId, {
    comment: "short lived",
    scopes: ["usage:write"],
    time_to_live_in_seconds: 20,
  });

  if (error) {
    throw error;
  }

  return result;
};

app.get("/key", async (req, res) => {
  const projectId = await getProjectId();
  const key = await getTempApiKey(projectId);

  res.json(key);
});

// WebSocket connection handler for penta transcription (5 services)
wss.on('connection', (ws) => {
  console.log('Client connected for penta transcription');
  
  let deepgramConnection = null;
  let assemblyConnection = null;
  let cartesiaConnection = null;
  let speechmaticsConnection = null;
  let speechmaticsReady = false;
  let googleConnection = null;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start') {
        console.log('Starting penta transcription services...');
        
        // Start Deepgram connection (configured for PCM16)
        try {
          deepgramConnection = client.listen.live({ 
            model: "nova-3",
            encoding: "linear16",
            sample_rate: 16000,
            channels: 1,
            smart_format: true,
            interim_results: true
          });
          
          deepgramConnection.on("open", () => {
            console.log("Server: Deepgram connection opened");
            ws.send(JSON.stringify({
              type: 'deepgram_status',
              status: 'connected'
            }));
          });
          
          deepgramConnection.on("Results", (data) => {
            console.log("Server: Deepgram transcript received");
            ws.send(JSON.stringify({
              type: 'deepgram_transcript',
              data: data
            }));
          });
          
          deepgramConnection.on("error", (error) => {
            console.error("Server: Deepgram error:", error);
            ws.send(JSON.stringify({
              type: 'deepgram_error',
              error: error.message
            }));
          });
          
        } catch (error) {
          console.error("Server: Failed to create Deepgram connection:", error);
        }
        
        // Start AssemblyAI Universal Streaming v3 connection
        try {
          const assemblyWsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&format_turns=true`;
          
          assemblyConnection = new WebSocket(assemblyWsUrl, {
            headers: {
              'Authorization': ASSEMBLYAI_API_KEY
            }
          });
          
          assemblyConnection.on('open', () => {
            console.log('Server: AssemblyAI Universal Streaming v3 connection opened');
            ws.send(JSON.stringify({
              type: 'assembly_status',
              status: 'connected'
            }));
          });
          
          assemblyConnection.on('message', (message) => {
            try {
              const response = JSON.parse(message.toString());
              console.log('Server: AssemblyAI response type:', response.type);
              
              if (response.type === 'Begin') {
                console.log(`Server: AssemblyAI session started with ID: ${response.id}`);
              } else if (response.type === 'Turn') {
                if (response.transcript) {
                  console.log("Server: AssemblyAI transcript received:", response.transcript);
                  ws.send(JSON.stringify({
                    type: 'assembly_transcript',
                    data: { text: response.transcript }
                  }));
                }
              } else if (response.type === 'Error') {
                console.error('Server: AssemblyAI error:', response.error);
                ws.send(JSON.stringify({
                  type: 'assembly_error',
                  error: response.error
                }));
              } else if (response.type === 'Termination') {
                console.log('Server: AssemblyAI session terminated');
              }
            } catch (parseError) {
              console.error('Server: Error parsing AssemblyAI message:', parseError);
            }
          });
          
          assemblyConnection.on('error', (error) => {
            console.error('Server: AssemblyAI WebSocket error:', error);
            ws.send(JSON.stringify({
              type: 'assembly_error',
              error: error.message
            }));
          });
          
          assemblyConnection.on('close', (code, reason) => {
            console.log(`Server: AssemblyAI connection closed: ${code} ${reason}`);
          });
          
        } catch (error) {
          console.error("Server: Failed to create AssemblyAI Universal Streaming connection:", error);
        }
        
        // Start Cartesia Ink-Whisper connection using SDK
        try {
          // Use the SDK's websocket method
          cartesiaConnection = cartesiaClient.stt.websocket({
            model: 'ink-whisper',
            language: 'en',
            encoding: 'pcm_s16le',
            sampleRate: 16000,
          });
          
          console.log('Server: Cartesia Ink-Whisper SDK connection initialized');
          
          // Set up message handler
          cartesiaConnection.onMessage((result) => {
            console.log('Server: Cartesia SDK message received:', result);
            
            if (result.type === 'transcript') {
              const status = result.isFinal ? 'FINAL' : 'INTERIM';
              console.log(`Server: Cartesia transcript received [${status}]:`, result.text);
              
              ws.send(JSON.stringify({
                type: 'cartesia_transcript',
                data: {
                  text: result.text,
                  is_final: result.isFinal
                }
              }));
            } else if (result.type === 'flush_done') {
              console.log('Server: Cartesia flush completed');
            } else if (result.type === 'done') {
              console.log('Server: Cartesia transcription session completed');
            } else if (result.type === 'error') {
              console.error('Server: Cartesia error:', result.message);
              ws.send(JSON.stringify({
                type: 'cartesia_error',
                error: result.message
              }));
            }
          });
          
          ws.send(JSON.stringify({
            type: 'cartesia_status',
            status: 'connected'
          }));
          
        } catch (error) {
          console.error("Server: Failed to create Cartesia SDK connection:", error);
          ws.send(JSON.stringify({
            type: 'cartesia_error',
            error: error.message
          }));
        }
        
        // Start Speechmatics connection using SDK
        try {
          if (SPEECHMATICS_API_KEY) {
            speechmaticsConnection = new RealtimeClient();
            
            speechmaticsConnection.addEventListener('receiveMessage', ({ data }) => {
              if (data.message === 'RecognitionStarted') {
                console.log("Server: Speechmatics recognition started, ready to receive audio");
                speechmaticsReady = true;
                ws.send(JSON.stringify({
                  type: 'speechmatics_status',
                  status: 'connected'
                }));
              } else if (data.message === 'AddPartialTranscript') {
                const partialText = data.results
                  .map((r) => r.alternatives?.[0]?.content || '')
                  .join(' ');
                console.log("Server: Speechmatics partial transcript received:", partialText);
                ws.send(JSON.stringify({
                  type: 'speechmatics_transcript',
                  data: {
                    text: partialText,
                    is_final: false
                  }
                }));
              } else if (data.message === 'AddTranscript') {
                const finalText = data.results
                  .map((r) => r.alternatives?.[0]?.content || '')
                  .join(' ');
                console.log("Server: Speechmatics final transcript received:", finalText);
                ws.send(JSON.stringify({
                  type: 'speechmatics_transcript',
                  data: {
                    text: finalText,
                    is_final: true
                  }
                }));
              } else if (data.message === 'Error') {
                console.error('Server: Speechmatics error:', data);
                ws.send(JSON.stringify({
                  type: 'speechmatics_error',
                  error: data.reason || 'Unknown error'
                }));
              }
            });
            
            // Create JWT token and start connection
            const jwt = await createSpeechmaticsJWT({
              type: 'rt',
              apiKey: SPEECHMATICS_API_KEY,
              ttl: 3600, // 1 hour
            });
            
            await speechmaticsConnection.start(jwt, {
              audio_format: {
                type: 'raw',
                encoding: 'pcm_s16le',
                sample_rate: 16000
              },
              transcription_config: {
                language: 'en',
                enable_partials: true,
                operating_point: 'enhanced',
                max_delay: 2.0,
                diarization: 'speaker'
              },
            });
            
            console.log('Server: Speechmatics SDK connection initialized, waiting for RecognitionStarted...');
          } else {
            console.warn('Server: Speechmatics API key not configured');
          }
          
        } catch (error) {
          console.error("Server: Failed to create Speechmatics SDK connection:", error);
          ws.send(JSON.stringify({
            type: 'speechmatics_error',
            error: error.message
          }));
        }
        
        // Start Google Cloud Speech-to-Text connection
        try {
          if (GOOGLE_API_KEY) { //not sure is just api key is enough or we need to use the client library
            const request = {
              config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: 'en-US',
                enableAutomaticPunctuation: true,
              },
              interimResults: true,
            };
            
            googleConnection = googleSpeechClient
              .streamingRecognize(request)
              .on('error', (error) => {
                console.error('Server: Google Speech error:', error);
                ws.send(JSON.stringify({
                  type: 'google_error',
                  error: error.message
                }));
              })
              .on('data', (data) => {
                if (data.results && data.results.length > 0) {
                  const result = data.results[0];
                  if (result.alternatives && result.alternatives.length > 0) {
                    const transcript = result.alternatives[0].transcript;
                    const isFinal = result.isFinal;
                    
                    console.log(`Server: Google Speech transcript received [${isFinal ? 'FINAL' : 'INTERIM'}]:`, transcript);
                    
                    ws.send(JSON.stringify({
                      type: 'google_transcript',
                      data: {
                        text: transcript,
                        is_final: isFinal
                      }
                    }));
                  }
                }
              });
            
            console.log('Server: Google Cloud Speech-to-Text connection initialized');
            ws.send(JSON.stringify({
              type: 'google_status',
              status: 'connected'
            }));
            
          } else {
            console.warn('Server: Google API key not configured');
          }
          
        } catch (error) {
          console.error("Server: Failed to create Google Speech connection:", error);
          ws.send(JSON.stringify({
            type: 'google_error',
            error: error.message
          }));
        }
      }
      
      if (data.type === 'audio' && data.audio) {
        const audioBuffer = Buffer.from(data.audio, 'base64');
        console.log("Server: PCM16 audio buffer size:", audioBuffer.length, "bytes");
        
        // Forward PCM16 audio to all five services
        if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
          deepgramConnection.send(audioBuffer);
          console.log("Server: PCM16 audio sent to Deepgram");
        }
        
        if (assemblyConnection && assemblyConnection.readyState === WebSocket.OPEN) {
          // AssemblyAI Universal Streaming v3 expects raw binary data
          assemblyConnection.send(audioBuffer, { binary: true });
          console.log("Server: PCM16 audio sent to AssemblyAI Universal Streaming v3");
        }
        
        if (cartesiaConnection) {
          try {
            // Cartesia SDK expects ArrayBuffer
            const arrayBuffer = audioBuffer.buffer.slice(
              audioBuffer.byteOffset,
              audioBuffer.byteOffset + audioBuffer.byteLength
            );
            cartesiaConnection.send(arrayBuffer);
            console.log("Server: PCM16 audio sent to Cartesia SDK");
          } catch (error) {
            console.error("Server: Error sending audio to Cartesia SDK:", error);
          }
        }
        
        if (speechmaticsConnection && speechmaticsReady) {
          try {
            speechmaticsConnection.sendAudio(audioBuffer);
            console.log("Server: PCM16 audio sent to Speechmatics SDK");
          } catch (error) {
            console.error("Server: Error sending audio to Speechmatics SDK:", error);
          }
        }
        
        if (googleConnection) {
          try {
            googleConnection.write(audioBuffer);
            console.log("Server: PCM16 audio sent to Google Speech");
          } catch (error) {
            console.error("Server: Error sending audio to Google Speech:", error);
          }
        }
      }
      
      if (data.type === 'stop') {
        console.log('Stopping penta transcription services...');
        
        if (deepgramConnection) {
          deepgramConnection.finish();
          deepgramConnection = null;
        }
        
        if (assemblyConnection) {
          // Send termination message to AssemblyAI
          if (assemblyConnection.readyState === WebSocket.OPEN) {
            assemblyConnection.send(JSON.stringify({ type: "Terminate" }));
          }
          assemblyConnection.close();
          assemblyConnection = null;
        }
        
        if (cartesiaConnection) {
          try {
            // Finalize and disconnect using SDK methods
            cartesiaConnection.finalize();
            cartesiaConnection.done();
            cartesiaConnection.disconnect();
            cartesiaConnection = null;
            console.log("Server: Cartesia SDK connection closed");
          } catch (error) {
            console.error("Server: Error closing Cartesia SDK connection:", error);
          }
        }
        
        if (speechmaticsConnection) {
          try {
            speechmaticsReady = false;
            speechmaticsConnection.stopRecognition({ noTimeout: true });
            speechmaticsConnection = null;
            console.log("Server: Speechmatics SDK connection closed");
          } catch (error) {
            console.error("Server: Error closing Speechmatics SDK connection:", error);
            speechmaticsConnection = null;
            speechmaticsReady = false;
          }
        }
        
        if (googleConnection) {
          try {
            googleConnection.end();
            googleConnection = null;
            console.log("Server: Google Speech connection closed");
          } catch (error) {
            console.error("Server: Error closing Google Speech connection:", error);
          }
        }
      }
      
    } catch (error) {
      console.error('Server: Error processing message:', error);
    }
  });
  
  ws.on('close', async () => {
    console.log('Client disconnected, cleaning up connections...');
    
    if (deepgramConnection) {
      deepgramConnection.finish();
    }
    
    if (assemblyConnection) {
      if (assemblyConnection.readyState === WebSocket.OPEN) {
        assemblyConnection.send(JSON.stringify({ type: "Terminate" }));
      }
      assemblyConnection.close();
    }
    
    if (cartesiaConnection) {
      try {
        // Clean up using SDK methods
        cartesiaConnection.finalize();
        cartesiaConnection.done();
        cartesiaConnection.disconnect();
        console.log("Server: Cartesia SDK connection cleaned up");
      } catch (error) {
        console.error("Server: Error cleaning up Cartesia SDK connection:", error);
      }
    }
    
    if (speechmaticsConnection) {
      try {
        speechmaticsReady = false;
        speechmaticsConnection.stopRecognition({ noTimeout: true });
        console.log("Server: Speechmatics SDK connection cleaned up");
      } catch (error) {
        console.error("Server: Error cleaning up Speechmatics SDK connection:", error);
      }
    }
    
    if (googleConnection) {
      try {
        googleConnection.end();
        console.log("Server: Google Speech connection cleaned up");
      } catch (error) {
        console.error("Server: Error cleaning up Google Speech connection:", error);
      }
    }
  });
});

server.listen(3001, () => {
  console.log("Server listening on http://localhost:3001");
  console.log("WebSocket server ready for penta transcription with latest APIs:");
  console.log("- Deepgram Nova-3 (PCM16)");
  console.log("- AssemblyAI Universal Streaming v3 (PCM16)");
  console.log("- Cartesia Ink-Whisper");
  console.log("- Speechmatics");
  console.log("- Google Cloud Speech-to-Text");
});
