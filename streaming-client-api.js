'use strict';
import DID_API from './api.json' assert { type: 'json' };

const QUESTIONS = [
  {
    question: 'Chi può accedere all’elenco dei delegati alle vendite?',
    answer:
      'Si ritiene che solo l’iscritto alla sezione A dell’albo possa svolgere la funzione di delegato alle vendite',
  },
  {
    question: 'Chi ha predisposto le linee guida generali per la formazione dei delegati?',
    answer:
      'La Scuola superiore della magistratura e la formazione dei professionisti che provvedono alle operazioni di vendita.',
  },
  {
    question:
      'Ai fini del positivo superamento della prova finale di esame del corso di formazione per i delegati alle vendite, quante devono essere le risposte esatte?',
    answer: 'Il test sarà considerato superato rispondendo correttamente ad almeno 35 domande.',
  },
  {
    question:
      'Secondo quanto previsto dall’art. 179 - ter disp. att. c.p.c. quanti incarichi deve aver svolto il professionista delegato alle operazioni di vendita nel quinquennio precedente per essere iscritto nell’elenco dei delegati?',
    answer:
      'Ai fini della dimostrazione della specifica competenza tecnica per la prima iscrizione nell’elenco è richiesto lo svolgimento nel quinquennio precedente di non meno di dieci incarichi di professionista delegato alle operazioni di vendita, senza che la delega sia stata revocata in conseguenza del mancato rispetto dei termini o delle direttive stabilite dal giudice dell’esecuzione',
  },
];

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;

let streamingOn = false;

const talkVideo = document.getElementById('talk-video');
talkVideo.setAttribute('playsinline', '');

talkVideo.addEventListener('loadedmetadata', function () {
  console.log('Video Metadata - videoWidth: ' + this.videoWidth + 'px,  videoHeight: ' + this.videoHeight + 'px');
});

// const peerStatusLabel = document.getElementById('peer-status-label');
// const iceStatusLabel = document.getElementById('ice-status-label');
// const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
// const signalingStatusLabel = document.getElementById('signaling-status-label');
// const streamingStatusLabel = document.getElementById('streaming-status-label');

const connect = async () => {
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  const sessionResponse = await fetchWithRetries(`${DID_API.url}/talks/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: 'https://webtoup.it/AI/avatar/avatar_cut.jpeg',
    }),
  });

  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;

  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${DID_API.url}/talks/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};

document.getElementById('send-button').addEventListener('click', async function () {
  const userInput = document.getElementById('user-input');
  const chatBox = document.getElementById('chat-box');

  if (userInput.value.trim() !== '') {
    // Display user's message
    const userMessage = document.createElement('div');
    userMessage.classList.add('message', 'user');
    userMessage.textContent = userInput.value;
    chatBox.appendChild(userMessage);

    const highestElement = QUESTIONS.map(({ question, answer }, i) => {
      const similarity = cosineSimilarity(question, userInput.value);
      return {
        similarity,
        answer,
        id: i + 1,
      };
    }).reduce((max, current) => {
      return (max.similarity || 0) > current.similarity ? max : current;
    });

    console.log(highestElement);

    // Example response from the bot
    // You can replace this with an actual API call to ChatGPT or any other service
    const botMessage = document.createElement('div');
    botMessage.classList.add('message', 'bot');

    chatBox.appendChild(botMessage);

    // Create the main 'loading' div
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';

    // Create 3 dot divs and append to the 'loading' div
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      loadingDiv.appendChild(dot);
    }
    botMessage.appendChild(loadingDiv);
    if (highestElement.similarity > 0.2) {
      if(streamingOn){
        await startStream(highestElement.id);
        botMessage.removeChild(loadingDiv);
        botMessage.textContent = highestElement.answer;
      } else {
        setTimeout(() => {
          playAnswer(highestElement.id);
          botMessage.removeChild(loadingDiv);
          botMessage.textContent = highestElement.answer;
        }, 1500);
      }
    } else {
      setTimeout(() => {
        playAnswer(0);
        botMessage.removeChild(loadingDiv);
        botMessage.textContent = 'Non ho una risposta alla tua richiesta. Prova a riformulare la domanda.';
      }, 1500);
    }

    // Clear the input and scroll to the latest message
    userInput.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

const startStream = async (idRisposta) => {
  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    const talkResponse = await fetchWithRetries(`${DID_API.url}/talks/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script: {
          type: 'audio',
          audio_url: `https://webtoup.it/AI/avatar/risposta${idRisposta}.mp3`,
        },
        driver_url: 'bank://lively/',
        config: {
          stitch: true,
        },
        session_id: sessionId,
      }),
    });
  }
};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/talks/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
  window.location.reload();
};

function onIceGatheringStateChange() {
  // iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  // iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
  console.log('ICE Gathering State changed to [', peerConnection.iceGatheringState, ']');
}

function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    fetch(`${DID_API.url}/talks/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  // iceStatusLabel.innerText = peerConnection.iceConnectionState;
  // iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  console.log('ICE Connection State changed to [', peerConnection.iceConnectionState, ']');
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  console.log('Connection State changed to [', peerConnection.connectionState, ']');
  // peerStatusLabel.innerText = peerConnection.connectionState;
  // peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
}
function onSignalingStateChange() {
  // signalingStatusLabel.innerText = peerConnection.signalingState;
  // signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
  console.log('Signaling State changed to [', peerConnection.signalingState, ']');
}

function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = 'streaming';
    console.log(stream);
    talkVideo.style.transform = 'scaleX(1.66796875) scaleY(1.16015625)';
    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    talkVideo.style.transform = 'scaleX(1) scaleY(1)';
    status = 'empty';
    playIdleVideo();
  }
  // streamingStatusLabel.innerText = status;
  // streamingStatusLabel.className = 'streamingState-' + status;
  console.log('Video Status changed to [', status, ']');
}

function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no talk is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}

function setVideoElement(stream) {
  if (!stream) return;
  talkVideo.srcObject = stream;
  talkVideo.loop = false;

  // safari hotfix
  if (talkVideo.paused) {
    talkVideo
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}

function playAnswer(id) {
  talkVideo.addEventListener('ended', playIdleVideo);
  talkVideo.srcObject = undefined;
  talkVideo.src = `video/answer${id}.mp4`;
  talkVideo.loop = false;
}

function playIdleVideo() {
  talkVideo.removeEventListener('ended', playIdleVideo);
  talkVideo.srcObject = undefined;
  talkVideo.src = 'video/or_idle_cut.mp4';
  talkVideo.loop = true;
}

function stopAllStreams() {
  if (talkVideo.srcObject) {
    console.log('stopping video streams');
    talkVideo.srcObject.getTracks().forEach((track) => track.stop());
    talkVideo.srcObject = null;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  clearInterval(statsIntervalId);
  // iceGatheringStatusLabel.innerText = '';
  // signalingStatusLabel.innerText = '';
  // iceStatusLabel.innerText = '';
  // peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

const maxRetryCount = 3;
const maxDelaySec = 4;

async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

document.getElementById('startButton').onclick = async () => {
  document.getElementById('startButton').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  await connect();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('content').classList.remove('hidden');
  document.getElementById('buttons').classList.remove('hidden');
  playIdleVideo();
  talkVideo.play();
};

function tokenize(text) {
  return text.toLowerCase().match(/\b\w+\b/g);
}

function termFrequency(term, tokens) {
  let count = 0;
  for (let token of tokens) {
    if (token === term) count++;
  }
  return count;
}

function cosineSimilarity(phrase1, phrase2) {
  let tokens1 = tokenize(phrase1);
  let tokens2 = tokenize(phrase2);
  let terms = Array.from(new Set([...tokens1, ...tokens2]));

  let vector1 = terms.map((term) => termFrequency(term, tokens1));
  let vector2 = terms.map((term) => termFrequency(term, tokens2));

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < terms.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += Math.pow(vector1[i], 2);
    magnitude2 += Math.pow(vector2[i], 2);
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}
