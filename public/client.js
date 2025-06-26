// DOM Elements
const deepgramCaptions = document.getElementById("deepgram-captions");
const comparisonCaptions = document.getElementById("comparison-captions");
const deepgramStatus = document.getElementById("deepgram-status");
const comparisonStatus = document.getElementById("comparison-status");
const recordButton = document.getElementById("record");

// Model selection elements
const comparisonModelSelect = document.getElementById("comparison-model-select");
const comparisonModelTitle = document.getElementById("comparison-model-title");
const comparisonPanel = document.getElementById("comparison-panel");
const comparisonWordLabel = document.getElementById("comparison-word-label");
const comparisonWordCount = document.getElementById("comparison-word-count");
const comparisonWerLabel = document.getElementById("comparison-wer-label");

// Stats elements
const recordingTimer = document.getElementById("recording-timer");
const deepgramWordCount = document.getElementById("deepgram-word-count");

// New mode and file elements
const liveInterface = document.getElementById("live-interface");
const fileInterface = document.getElementById("file-interface");
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const uploadedFiles = document.getElementById("uploaded-files");
const processFilesBtn = document.getElementById("process-files-btn");
const referenceTranscript = document.getElementById("reference-transcript");
const werStats = document.getElementById("wer-stats");
const deepgramWER = document.getElementById("deepgram-wer");
const assemblyWER = document.getElementById("assembly-wer");
const referenceWordCount = document.getElementById("reference-word-count");

// WebSocket connection to server
let serverSocket = null;
let audioContext = null;
let audioWorklet = null;
let mediaStream = null;
let isRecording = false;

// Timer and word counting variables
let startTime = null;
let timerInterval = null;
let deepgramTotalWords = 0;
let comparisonTotalWords = 0;

// First response time tracking for each service
let deepgramFirstResponse = null;
let comparisonFirstResponse = null;
let recordingStartTime = null;

// Current comparison model
let currentComparisonModel = 'assemblyai';

// APPEND MODE VARIABLES
let deepgramTranscripts = []; // Array of final transcripts
let comparisonTranscripts = []; // Array of final transcripts
let deepgramInterimTranscript = ""; // Current interim transcript
let comparisonInterimTranscript = ""; // Current interim transcript

// File upload variables
let currentMode = 'live';
let uploadedFilesList = [];

// Test scripts for WER calculation
const testScripts = {
  1: "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet at least once.",
  2: "In artificial intelligence, natural language processing is a subfield of linguistics, computer science, and artificial intelligence concerned with the interactions between computers and human language.",
  3: "Machine learning is a method of data analysis that automates analytical model building. It is a branch of artificial intelligence based on the idea that systems can learn from data, identify patterns and make decisions with minimal human intervention."
};

// HISTORY MODE VARIABLES (COMMENTED OUT - uncomment to switch back)
// let deepgramHistory = [];
// let assemblyHistory = [];
// let deepgramCurrentTranscript = "";
// let assemblyCurrentTranscript = "";

// Mode switching functionality
function switchMode(mode) {
  currentMode = mode;
  
  // Update button states
  document.getElementById('live-mode-btn').classList.toggle('active', mode === 'live');
  document.getElementById('file-mode-btn').classList.toggle('active', mode === 'file');
  
  // Show/hide interfaces
  liveInterface.style.display = mode === 'live' ? 'block' : 'none';
  fileInterface.style.display = mode === 'file' ? 'block' : 'none';
  
  // Reset displays when switching modes
  if (mode === 'file') {
    clearTranscripts();
    resetStats();
    werStats.style.display = 'none';
  }
}

// Model switching functionality
function switchComparisonModel() {
  const selectedModel = comparisonModelSelect.value;
  currentComparisonModel = selectedModel;
  
  // Update UI elements based on selected model
  const modelInfo = {
    assemblyai: {
      title: 'AssemblyAI v3',
      panelClass: 'assemblyai-panel',
      wordLabel: 'AssemblyAI Words',
      werLabel: 'AssemblyAI WER'
    },
    cartesia: {
      title: 'Cartesia Ink-Whisper',
      panelClass: 'cartesia-panel',
      wordLabel: 'Cartesia Words',
      werLabel: 'Cartesia WER'
    },
    speechmatics: {
      title: 'Speechmatics',
      panelClass: 'speechmatics-panel',
      wordLabel: 'Speechmatics Words',
      werLabel: 'Speechmatics WER'
    },
    google: {
      title: 'Google Cloud Speech',
      panelClass: 'google-panel',
      wordLabel: 'Google Words',
      werLabel: 'Google WER'
    }
  };
  
  const info = modelInfo[selectedModel];
  if (info) {
    comparisonModelTitle.textContent = info.title;
    comparisonWordLabel.textContent = info.wordLabel;
    comparisonWerLabel.textContent = info.werLabel;
    
    // Update panel class
    comparisonPanel.className = `transcript-panel comparison-panel ${info.panelClass}`;
    
    // Update word count class
    const comparisonCountElement = document.querySelector('.comparison-count');
    if (comparisonCountElement) {
      comparisonCountElement.className = `word-count comparison-count ${selectedModel}-count`;
    }
  }
  
  // Clear transcripts when switching models
  clearTranscripts();
  resetStats();
  
  console.log('Switched comparison model to:', selectedModel);
}

// Clear transcript displays
function clearTranscripts() {
  deepgramCaptions.innerHTML = '<span class="placeholder">Transcription will appear here...</span>';
  comparisonCaptions.innerHTML = '<span class="placeholder">Transcription will appear here...</span>';
  
  // Reset transcript arrays
  deepgramTranscripts = [];
  comparisonTranscripts = [];
  deepgramInterimTranscript = "";
  comparisonInterimTranscript = "";
}

// Load test scripts
function loadTestScript(scriptNumber) {
  const script = testScripts[scriptNumber];
  if (script) {
    referenceTranscript.value = script;
    updateReferenceWordCount();
  }
}

// Update reference word count
function updateReferenceWordCount() {
  const text = referenceTranscript.value.trim();
  const wordCount = text ? countWords(text) : 0;
  referenceWordCount.textContent = wordCount;
}

// File upload handling
uploadArea.addEventListener('click', () => {
  fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  
  const files = Array.from(e.dataTransfer.files);
  handleFileSelection(files);
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  handleFileSelection(files);
});

function handleFileSelection(files) {
  files.forEach(file => {
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
      uploadedFilesList.push({
        file: file,
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size
      });
    }
  });
  
  updateUploadedFilesList();
  
  if (uploadedFilesList.length > 0) {
    processFilesBtn.style.display = 'block';
  }
}

function updateUploadedFilesList() {
  uploadedFiles.innerHTML = '';
  
  uploadedFilesList.forEach((fileItem, index) => {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item';
    fileDiv.innerHTML = `
      <div class="file-info">
        <i class="fas fa-file-audio file-icon"></i>
        <div class="file-details">
          <div class="file-name">${fileItem.name}</div>
          <div class="file-size">${formatFileSize(fileItem.size)}</div>
        </div>
      </div>
      <button class="file-remove" onclick="removeFile(${index})">
        <i class="fas fa-times"></i>
      </button>
    `;
    uploadedFiles.appendChild(fileDiv);
  });
}

function removeFile(index) {
  uploadedFilesList.splice(index, 1);
  updateUploadedFilesList();
  
  if (uploadedFilesList.length === 0) {
    processFilesBtn.style.display = 'none';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Process uploaded files
async function processFiles() {
  if (uploadedFilesList.length === 0) return;
  
  processFilesBtn.disabled = true;
  processFilesBtn.innerHTML = '<div class="processing-spinner"></div> Processing...';
  
  try {
    // Clear previous results
    clearTranscripts();
    resetStats();
    
    for (const fileItem of uploadedFilesList) {
      await processFile(fileItem);
    }
    
    // Show WER statistics if reference transcript is provided
    const refText = referenceTranscript.value.trim();
    if (refText) {
      updateWERDisplay(refText);
      werStats.style.display = 'block';
    }
    
  } catch (error) {
    console.error('File processing error:', error);
    alert('Error processing files: ' + error.message);
  } finally {
    processFilesBtn.disabled = false;
    processFilesBtn.innerHTML = '<i class="fas fa-play"></i> Process Files';
  }
}

async function processFile(fileItem) {
  try {
    // Upload file
    const formData = new FormData();
    formData.append('files', fileItem.file);
    
    const uploadResponse = await fetch('/upload', {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    if (!uploadResult.success) {
      throw new Error('Upload failed: ' + uploadResult.error);
    }
    
    const uploadedFile = uploadResult.files[0];
    
    // Process audio
    const processResponse = await fetch('/process-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: uploadedFile.filename,
        referenceTranscript: referenceTranscript.value.trim()
      })
    });
    
    const processResult = await processResponse.json();
    if (!processResult.success) {
      throw new Error('Processing failed: ' + processResult.error);
    }
    
    // Update displays with results
    displayFileResults(fileItem.name, processResult.results);
    
    // Clean up uploaded file
    await fetch(`/upload/${uploadedFile.filename}`, {
      method: 'DELETE'
    });
    
  } catch (error) {
    console.error(`Error processing file ${fileItem.name}:`, error);
    // Continue with other files
  }
}

function displayFileResults(fileName, results) {
  // Add file header
  const fileHeader = `<div class="file-header">${fileName}</div>`;
  
  // Add Deepgram result
  if (results.deepgram.transcript) {
    deepgramTranscripts.push(results.deepgram.transcript);
    deepgramTotalWords += countWords(results.deepgram.transcript);
  } else if (results.deepgram.error) {
    deepgramTranscripts.push(`Error: ${results.deepgram.error}`);
  }
  
  // Add AssemblyAI result
  if (results.assembly.transcript) {
    comparisonTranscripts.push(results.assembly.transcript);
    comparisonTotalWords += countWords(results.assembly.transcript);
  } else if (results.assembly.error) {
    comparisonTranscripts.push(`Error: ${results.assembly.error}`);
  }
  
  // Update displays
  updateDeepgramDisplayAppend();
  updateComparisonDisplayAppend();
  updateStats();
}

function updateWERDisplay(referenceText) {
  const refWords = countWords(referenceText);
  referenceWordCount.textContent = refWords;
  
  // Calculate WER for each service
  const deepgramText = deepgramTranscripts.join(' ');
  const comparisonText = comparisonTranscripts.join(' ');
  
  if (deepgramText) {
    const dgWER = calculateWER(referenceText, deepgramText);
    deepgramWER.textContent = dgWER.toFixed(1) + '%';
  } else {
    deepgramWER.textContent = '-';
  }
  
  if (comparisonText) {
    const asWER = calculateWER(referenceText, comparisonText);
    assemblyWER.textContent = asWER.toFixed(1) + '%';
  } else {
    assemblyWER.textContent = '-';
  }
}

// WER calculation using Levenshtein distance
function calculateWER(reference, hypothesis) {
  const refWords = reference.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const hypWords = hypothesis.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  if (refWords.length === 0) return 0;
  
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

// Add reference transcript listener
referenceTranscript.addEventListener('input', updateReferenceWordCount);

// Initialize connection to server
function connectToServer() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  console.log("Client: Connecting to server WebSocket...");
  serverSocket = new WebSocket(wsUrl);
  
  serverSocket.onopen = () => {
    console.log("Client: Connected to server");
  };
  
  serverSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  serverSocket.onerror = (error) => {
    console.error("Client: WebSocket error:", error);
  };
  
  serverSocket.onclose = () => {
    console.log("Client: Disconnected from server");
    updateStatus("disconnected");
  };
}

// Handle messages from server
function handleServerMessage(data) {
  console.log("Client: Received message:", data.type);
  
  switch (data.type) {
    case 'deepgram_status':
      if (data.status === 'connected') {
        deepgramStatus.textContent = 'Connected';
        deepgramStatus.classList.add('connected');
        console.log("Client: Deepgram connected");
      }
      break;
      
    case 'assembly_status':
      if (data.status === 'connected' && currentComparisonModel === 'assemblyai') {
        comparisonStatus.textContent = 'Connected';
        comparisonStatus.classList.add('connected');
        console.log("Client: AssemblyAI connected");
      }
      break;
      
    case 'cartesia_status':
      if (data.status === 'connected' && currentComparisonModel === 'cartesia') {
        comparisonStatus.textContent = 'Connected';
        comparisonStatus.classList.add('connected');
        console.log("Client: Cartesia connected");
      }
      break;
      
    case 'speechmatics_status':
      if (data.status === 'connected' && currentComparisonModel === 'speechmatics') {
        comparisonStatus.textContent = 'Connected';
        comparisonStatus.classList.add('connected');
        console.log("Client: Speechmatics connected");
      }
      break;
      
    case 'google_status':
      if (data.status === 'connected' && currentComparisonModel === 'google') {
        comparisonStatus.textContent = 'Connected';
        comparisonStatus.classList.add('connected');
        console.log("Client: Google Speech connected");
      }
      break;
      
    case 'deepgram_transcript':
      updateDeepgramTranscriptAppend(data.data);
      break;
      
    case 'assembly_transcript':
      if (currentComparisonModel === 'assemblyai') {
        updateComparisonTranscriptAppend(data.data, 'assemblyai');
      }
      break;
      
    case 'cartesia_transcript':
      if (currentComparisonModel === 'cartesia') {
        updateCartesiaTranscriptAppend(data.data);
      }
      break;
      
    case 'speechmatics_transcript':
      if (currentComparisonModel === 'speechmatics') {
        updateSpeechmaticsTranscriptAppend(data.data);
      }
      break;
      
    case 'google_transcript':
      if (currentComparisonModel === 'google') {
        updateGoogleTranscriptAppend(data.data);
      }
      break;
      
    case 'deepgram_error':
      console.error("Client: Deepgram error:", data.error);
      deepgramStatus.textContent = 'Error';
      deepgramStatus.classList.remove('connected');
      break;
      
    case 'assembly_error':
      if (currentComparisonModel === 'assemblyai') {
        console.error("Client: AssemblyAI error:", data.error);
        comparisonStatus.textContent = 'Error';
        comparisonStatus.classList.remove('connected');
      }
      break;
      
    case 'cartesia_error':
      if (currentComparisonModel === 'cartesia') {
        console.error("Client: Cartesia error:", data.error);
        comparisonStatus.textContent = 'Error';
        comparisonStatus.classList.remove('connected');
      }
      break;
      
    case 'speechmatics_error':
      if (currentComparisonModel === 'speechmatics') {
        console.error("Client: Speechmatics error:", data.error);
        comparisonStatus.textContent = 'Error';
        comparisonStatus.classList.remove('connected');
      }
      break;
      
    case 'google_error':
      if (currentComparisonModel === 'google') {
        console.error("Client: Google Speech error:", data.error);
        comparisonStatus.textContent = 'Error';
        comparisonStatus.classList.remove('connected');
      }
      break;
  }
}

// APPEND MODE - Update Cartesia transcript display
function updateCartesiaTranscriptAppend(data) {
  if (data.text && data.text.trim() !== "") {
    const isFinal = data.is_final || false;
    console.log("Client: Cartesia transcript:", data.text, isFinal ? "(final)" : "(interim)");
    
    // Track first response time only
    if (!comparisonFirstResponse && recordingStartTime) {
      comparisonFirstResponse = Date.now() - recordingStartTime;
      console.log("Cartesia first response time:", comparisonFirstResponse + "ms");
    }
    
    if (isFinal) {
      // Add final transcript to the list
      comparisonTranscripts.push(data.text);
      
      // Update total word count
      const newWords = countWords(data.text);
      comparisonTotalWords += newWords;
      
      // Clear interim transcript
      comparisonInterimTranscript = "";
    } else {
      // Update interim transcript
      comparisonInterimTranscript = data.text;
    }
    
    updateComparisonDisplayAppend();
    updateStats();
  }
}

// APPEND MODE - Update Speechmatics transcript display
function updateSpeechmaticsTranscriptAppend(data) {
  if (data.text && data.text.trim() !== "") {
    const isFinal = data.is_final || false;
    console.log("Client: Speechmatics transcript:", data.text, isFinal ? "(final)" : "(interim)");
    
    // Track first response time only
    if (!comparisonFirstResponse && recordingStartTime) {
      comparisonFirstResponse = Date.now() - recordingStartTime;
      console.log("Speechmatics first response time:", comparisonFirstResponse + "ms");
    }
    
    if (isFinal) {
      // Add final transcript to the list
      comparisonTranscripts.push(data.text);
      
      // Update total word count
      const newWords = countWords(data.text);
      comparisonTotalWords += newWords;
      
      // Clear interim transcript
      comparisonInterimTranscript = "";
    } else {
      // Update interim transcript
      comparisonInterimTranscript = data.text;
    }
    
    updateComparisonDisplayAppend();
    updateStats();
  }
}

// APPEND MODE - Update Google Speech transcript display
function updateGoogleTranscriptAppend(data) {
  if (data.text && data.text.trim() !== "") {
    const isFinal = data.is_final || false;
    console.log("Client: Google Speech transcript:", data.text, isFinal ? "(final)" : "(interim)");
    
    // Track first response time only
    if (!comparisonFirstResponse && recordingStartTime) {
      comparisonFirstResponse = Date.now() - recordingStartTime;
      console.log("Google Speech first response time:", comparisonFirstResponse + "ms");
    }
    
    if (isFinal) {
      // Add final transcript to the list
      comparisonTranscripts.push(data.text);
      
      // Update total word count
      const newWords = countWords(data.text);
      comparisonTotalWords += newWords;
      
      // Clear interim transcript
      comparisonInterimTranscript = "";
    } else {
      // Update interim transcript
      comparisonInterimTranscript = data.text;
    }
    
    updateComparisonDisplayAppend();
    updateStats();
  }
}

// APPEND MODE - Update Deepgram transcript display
function updateDeepgramTranscriptAppend(data) {
  if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
    const transcript = data.channel.alternatives[0].transcript;
    const isFinal = data.is_final || false;
    const confidence = data.channel.alternatives[0].confidence || 0;
    
    if (transcript && transcript.trim() !== "") {
      console.log("Client: Deepgram transcript:", transcript, isFinal ? "(final)" : "(interim)");
      
      // Track first response time only
      if (!deepgramFirstResponse && recordingStartTime) {
        deepgramFirstResponse = Date.now() - recordingStartTime;
        console.log("Deepgram first response time:", deepgramFirstResponse + "ms");
      }
      
      if (isFinal) {
        // Add final transcript to the list
        deepgramTranscripts.push(transcript);
        
        // Update total word count
        const newWords = countWords(transcript);
        deepgramTotalWords += newWords;
        
        // Clear interim transcript
        deepgramInterimTranscript = "";
      } else {
        // Update interim transcript
        deepgramInterimTranscript = transcript;
      }
      
      updateDeepgramDisplayAppend();
      updateStats();
    }
  }
}

// APPEND MODE - Update AssemblyAI transcript display
function updateComparisonTranscriptAppend(data, model) {
  if (data.text && data.text.trim() !== "") {
    console.log("Client: AssemblyAI transcript:", data.text);
    
    // Track first response time only
    if (!comparisonFirstResponse && recordingStartTime) {
      comparisonFirstResponse = Date.now() - recordingStartTime;
      console.log("AssemblyAI first response time:", comparisonFirstResponse + "ms");
    }
    
    const currentFullTranscript = data.text;
    const previousInterimTranscript = comparisonInterimTranscript || "";
    
    // AssemblyAI Universal Streaming v3 sends immutable transcripts
    // Each response contains the COMPLETE transcript so far for current turn
    
    // Check if this is a new turn (doesn't start with previous interim)
    if (previousInterimTranscript && !currentFullTranscript.startsWith(previousInterimTranscript)) {
      // This is a new turn - finalize the previous interim transcript
      comparisonTranscripts.push(previousInterimTranscript);
      
      // DON'T count words here - we've already been counting them incrementally
      console.log("AssemblyAI: Finalized transcript:", previousInterimTranscript);
      
      // Reset for new turn
      comparisonInterimTranscript = "";
    }
    
    // Count only the NEW words added in this update
    if (currentFullTranscript.startsWith(previousInterimTranscript)) {
      // This is a continuation of the same turn - count only new words
      const newWordsPortion = currentFullTranscript.substring(previousInterimTranscript.length).trim();
      if (newWordsPortion) {
        const newWordsCount = countWords(newWordsPortion);
        comparisonTotalWords += newWordsCount;
        
        console.log("AssemblyAI: New words added:", newWordsPortion, "Count:", newWordsCount);
      }
    } else {
      // This is a completely new turn - count all words
      const newWordsCount = countWords(currentFullTranscript);
      comparisonTotalWords += newWordsCount;
      
      console.log("AssemblyAI: New turn started:", currentFullTranscript, "Count:", newWordsCount);
    }
    
    // Update the current interim transcript (this grows immutably within a turn)
    comparisonInterimTranscript = currentFullTranscript;
    
    updateComparisonDisplayAppend();
    updateStats();
  }
}

// APPEND MODE - Update Deepgram display with all transcripts
function updateDeepgramDisplayAppend() {
  let displayHTML = '';
  
  // Add all final transcripts
  deepgramTranscripts.forEach((transcript, index) => {
    displayHTML += `<div class="final-transcript">${transcript}</div>`;
  });
  
  // Add current interim transcript
  if (deepgramInterimTranscript) {
    displayHTML += `<div class="interim-transcript">${deepgramInterimTranscript}</div>`;
  }
  
  if (!displayHTML) {
    displayHTML = '<span class="placeholder">Click the microphone to start transcribing...</span>';
  }
  
  deepgramCaptions.innerHTML = displayHTML;
  deepgramCaptions.scrollTop = deepgramCaptions.scrollHeight;
}

// APPEND MODE - Update AssemblyAI display with all transcripts
function updateComparisonDisplayAppend() {
  let displayHTML = '';
  
  // Add all final transcripts
  comparisonTranscripts.forEach((transcript, index) => {
    displayHTML += `<div class="final-transcript">${transcript}</div>`;
  });
  
  // Add current interim transcript (the growing immutable transcript)
  if (comparisonInterimTranscript) {
    displayHTML += `<div class="interim-transcript">${comparisonInterimTranscript}</div>`;
  }
  
  if (!displayHTML) {
    displayHTML = '<span class="placeholder">Click the microphone to start transcribing...</span>';
  }
  
  comparisonCaptions.innerHTML = displayHTML;
  comparisonCaptions.scrollTop = comparisonCaptions.scrollHeight;
}

// HISTORY MODE FUNCTIONS (COMMENTED OUT - uncomment to switch back)
/*
// Update Deepgram transcript display
function updateDeepgramTranscript(data) {
  if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
      const transcript = data.channel.alternatives[0].transcript;
    const isFinal = data.is_final || false;
    
    if (transcript && transcript.trim() !== "") {
      console.log("Client: Deepgram transcript:", transcript, isFinal ? "(final)" : "(interim)");
      
      if (isFinal) {
        // Add to history if it's different from current
        if (deepgramCurrentTranscript && deepgramCurrentTranscript !== transcript) {
          deepgramHistory.push(deepgramCurrentTranscript);
          // Keep only last 3 history items
          if (deepgramHistory.length > 3) {
            deepgramHistory.shift();
          }
        }
        
        // Add final transcript to history
        deepgramHistory.push(transcript);
        if (deepgramHistory.length > 3) {
          deepgramHistory.shift();
        }
        
        // Update total word count
        const newWords = countWords(transcript);
        deepgramTotalWords += newWords;
        
        // Clear current transcript
        deepgramCurrentTranscript = "";
      } else {
        // Update current interim transcript
        deepgramCurrentTranscript = transcript;
      }
      
      updateDeepgramDisplay();
      updateStats();
    }
  }
}

// Update AssemblyAI transcript display
function updateAssemblyTranscript(data) {
  if (data.text && data.text.trim() !== "") {
    console.log("Client: AssemblyAI transcript:", data.text);
    
    // AssemblyAI Universal Streaming v3 provides immutable transcripts
    // Each new transcript is an addition to the conversation
    const transcript = data.text;
    
    // Check if this is a new transcript or continuation
    const isNewTranscript = !assemblyCurrentTranscript || !transcript.startsWith(assemblyCurrentTranscript);
    
    if (isNewTranscript && assemblyCurrentTranscript) {
      // Previous transcript is now final, add to history
      assemblyHistory.push(assemblyCurrentTranscript);
      if (assemblyHistory.length > 3) {
        assemblyHistory.shift();
      }
      
      // Count words from the previous final transcript
      const newWords = countWords(assemblyCurrentTranscript);
      assemblyTotalWords += newWords;
    }
    
    // Update current transcript
    assemblyCurrentTranscript = transcript;
    
    updateAssemblyDisplay();
    updateStats();
  }
}

// Update Deepgram display with history and current transcript
function updateDeepgramDisplay() {
  let displayHTML = '';
  
  // Add history
  if (deepgramHistory.length > 0) {
    displayHTML += '<div class="transcript-history">';
    deepgramHistory.forEach((historyItem, index) => {
      displayHTML += `<div class="history-item">${historyItem}</div>`;
    });
    displayHTML += '</div>';
  }
  
  // Add current transcript
  if (deepgramCurrentTranscript) {
    displayHTML += `<div class="current-transcript">${deepgramCurrentTranscript}</div>`;
  }
  
  if (!displayHTML) {
    displayHTML = '<span class="placeholder">Click the microphone to start transcribing...</span>';
  }
  
  deepgramCaptions.innerHTML = displayHTML;
  deepgramCaptions.scrollTop = deepgramCaptions.scrollHeight;
}

// Update AssemblyAI display with history and current transcript
function updateAssemblyDisplay() {
  let displayHTML = '';
  
  // Add history
  if (assemblyHistory.length > 0) {
    displayHTML += '<div class="transcript-history">';
    assemblyHistory.forEach((historyItem, index) => {
      displayHTML += `<div class="history-item">${historyItem}</div>`;
    });
    displayHTML += '</div>';
  }
  
  // Add current transcript
  if (assemblyCurrentTranscript) {
    displayHTML += `<div class="current-transcript">${assemblyCurrentTranscript}</div>`;
  }
  
  if (!displayHTML) {
    displayHTML = '<span class="placeholder">Click the microphone to start transcribing...</span>';
  }
  
  comparisonCaptions.innerHTML = displayHTML;
  comparisonCaptions.scrollTop = comparisonCaptions.scrollHeight;
}
*/

// Count words in a transcript
function countWords(text) {
  if (!text || text.trim() === "") return 0;
  return text.trim().split(/\s+/).length;
}

// Format first response time
function formatFirstResponseTime(responseTime) {
  if (responseTime === null) return "No response yet";
  return responseTime + "ms";
}

// Update stats display
function updateStats() {
  // Display word counts
  deepgramWordCount.textContent = deepgramTotalWords;
  comparisonWordCount.textContent = comparisonTotalWords;
  
  // Display first response times
  const deepgramTime = formatFirstResponseTime(deepgramFirstResponse);
  const comparisonTime = formatFirstResponseTime(comparisonFirstResponse);
  
  deepgramWordCount.textContent = `${deepgramTotalWords} words | First: ${deepgramTime}`;
  comparisonWordCount.textContent = `${comparisonTotalWords} words | First: ${comparisonTime}`;
}

// Start timer
function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    const timeString = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    recordingTimer.textContent = timeString;
    
    // Update WPM in real-time
    updateStats();
  }, 1000);
}

// Stop timer
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Reset stats
function resetStats() {
  deepgramTotalWords = 0;
  comparisonTotalWords = 0;
  deepgramTranscripts = [];
  comparisonTranscripts = [];
  deepgramInterimTranscript = "";
  comparisonInterimTranscript = "";
  
  // Reset independent metrics
  deepgramFirstResponse = null;
  comparisonFirstResponse = null;
  recordingStartTime = null;
  
  deepgramWordCount.textContent = 'First response: No response yet';
  comparisonWordCount.textContent = 'First response: No response yet';
  recordingTimer.textContent = '00:00';
  stopTimer();
}

// Convert Float32Array to Int16Array (PCM16)
function float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to [-1, 1] and convert to 16-bit
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample * 0x7FFF;
  }
  return int16Array;
}

// Get microphone access and set up Web Audio API
async function setupAudioCapture() {
  try {
    // Get microphone stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    
    // Create audio source from stream
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Create script processor for audio data
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (event) => {
      if (!isRecording) return;
      
      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert to PCM16
      const pcmData = float32ToInt16(inputData);
      
      // Convert to base64 for transmission
      const buffer = new ArrayBuffer(pcmData.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(i * 2, pcmData[i], true); // little-endian
      }
      
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      
      // Send to server
      if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
        // Track when audio is sent for latency measurement
        lastAudioSentTime = Date.now();
        
        serverSocket.send(JSON.stringify({
          type: 'audio',
          audio: base64Audio
        }));
        console.log("Client: PCM16 audio data sent to server");
      }
    };
    
    // Connect audio nodes
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    return { source, processor };
    
  } catch (error) {
    console.error("Client: Error setting up audio capture:", error);
    throw error;
  }
}

// Start recording and transcription
async function startRecording() {
  try {
    console.log("Client: Starting recording...");
    
    // Reset stats and start timer
    resetStats();
    startTimer();
    
    // Set recording start time for first response calculation
    recordingStartTime = Date.now();
    
    // Set up audio capture
    const audioNodes = await setupAudioCapture();
    audioWorklet = audioNodes;
    
    // Send start message to server
    serverSocket.send(JSON.stringify({
      type: 'start'
    }));
    
    console.log("Client: Audio capture started");
    document.body.classList.add("recording");
    isRecording = true;
    updateStatus("connecting");
    
  } catch (error) {
    console.error("Client: Error starting recording:", error);
    updateStatus("error");
    stopTimer();
  }
}

// Stop recording and transcription
async function stopRecording() {
  console.log("Client: Stopping recording...");
  
  isRecording = false;
  
  // Finalize any remaining current transcripts
  if (deepgramInterimTranscript) {
    deepgramTranscripts.push(deepgramInterimTranscript);
    const newWords = countWords(deepgramInterimTranscript);
    deepgramTotalWords += newWords;
    deepgramInterimTranscript = "";
  }
  
  if (comparisonInterimTranscript) {
    comparisonTranscripts.push(comparisonInterimTranscript);
    // DON'T count words here - we've already been counting them incrementally
    comparisonInterimTranscript = "";
  }
  
  // Update displays and stats
  updateDeepgramDisplayAppend();
  updateComparisonDisplayAppend();
  updateStats();
  
  // Clean up audio context
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
  
  // Stop media stream
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  audioWorklet = null;
  
  // Send stop message to server
  if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
    serverSocket.send(JSON.stringify({
      type: 'stop'
    }));
  }
  
  document.body.classList.remove("recording");
  updateStatus("disconnected");
  stopTimer();
}

// Update status indicators
function updateStatus(status) {
  const statuses = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error"
  };
  
  if (status === "disconnected" || status === "error") {
    deepgramStatus.textContent = statuses[status];
    comparisonStatus.textContent = statuses[status];
    deepgramStatus.classList.remove('connected');
    comparisonStatus.classList.remove('connected');
  } else if (status === "connecting") {
    deepgramStatus.textContent = statuses[status];
    comparisonStatus.textContent = statuses[status];
    deepgramStatus.classList.remove('connected');
    comparisonStatus.classList.remove('connected');
  }
}

// Record button event listener
recordButton.addEventListener("click", async () => {
  if (!isRecording) {
    if (!serverSocket || serverSocket.readyState !== WebSocket.OPEN) {
      connectToServer();
      
      // Wait for connection before starting
      serverSocket.onopen = () => {
        console.log("Client: Server connected, starting recording");
        startRecording();
      };
    } else {
      await startRecording();
    }
  } else {
    await stopRecording();
  }
});

// Initialize on page load
window.addEventListener("load", () => {
  console.log("Client: Page loaded, initializing...");
  connectToServer();
  
  // Initialize displays
  updateDeepgramDisplayAppend();
  updateComparisonDisplayAppend();
  
  // Initialize stats
  resetStats();
});
