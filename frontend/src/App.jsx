import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  Instagram, 
  Send, 
  Activity, 
  MessageSquare, 
  TrendingUp, 
  Heart, 
  MessageCircle, 
  Users, 
  Calendar, 
  Clock, 
  Hash, 
  AlertTriangle, 
  Play, 
  RefreshCw,
  Sparkles,
  HelpCircle,
  Video
} from 'lucide-react';

function App() {
  // Input URLs State
  const [videoAUrl, setVideoAUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [videoBUrl, setVideoBUrl] = useState('https://www.instagram.com/reel/C8r9XYZ/');
  
  // App Processing States
  const [taskStatus, setTaskStatus] = useState('idle'); // idle, pending, processing, completed, failed
  const [taskId, setTaskId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [videoData, setVideoData] = useState(null);
  const [healthStatus, setHealthStatus] = useState('unknown'); // healthy, offline
  
  // Chat States
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { 
      role: 'assistant', 
      content: '👋 Welcome! Upload two social media video URLs above to get started. Once they are analyzed, I can compare their engagement rates, hook styles, script flows, and outline key optimization strategies!' 
    }
  ]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  
  const chatBottomRef = useRef(null);

  // Suggested Prompts
  const suggestedQuestions = [
    "Why did Video A perform better than Video B?",
    "Compare hooks in first 5–10 seconds",
    "What is the engagement rate of each video?",
    "Suggest improvements for Video B based on Video A insights"
  ];

  // Check backend health on load
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'healthy') setHealthStatus('healthy');
      })
      .catch(() => {
        setHealthStatus('offline');
      });
  }, []);

  // Scroll chat to bottom when history changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Convert watch URL to embed URL for YouTube
  const getYouTubeEmbedUrl = (url) => {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : '';
  };

  // Convert Reel URL to standard embed
  const getInstagramEmbedUrl = (url) => {
    if (!url) return '';
    const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([^\/?]+)/);
    return match ? `https://www.instagram.com/reel/${match[1]}/embed/captioned` : '';
  };

  // Format big numbers (e.g. 1500000 -> 1.5M)
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  // Submit URLs to start processing
  const handleProcessVideos = async (e) => {
    e.preventDefault();
    if (!videoAUrl || !videoBUrl) return;

    setTaskStatus('pending');
    setErrorMessage('');
    setVideoData(null);

    try {
      const response = await fetch('/api/upload-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_a_url: videoAUrl,
          video_b_url: videoBUrl
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to submit videos.');
      }

      const data = await response.json();
      setTaskId(data.task_id);
      
      if (data.status === 'completed') {
        // Fast-path instant cache hit
        setTaskStatus('completed');
        // Retrieve result
        fetchComparisonData(videoAUrl, videoBUrl);
      } else {
        setTaskStatus('pending');
        // Start polling status
        pollTaskStatus(data.task_id);
      }
    } catch (err) {
      setTaskStatus('failed');
      setErrorMessage(err.message || 'Error processing request.');
    }
  };

  // Fetch metrics side-by-side once completed
  const fetchComparisonData = async (urlA, urlB) => {
    try {
      const res = await fetch(`/api/videos/compare?url_a=${encodeURIComponent(urlA)}&url_b=${encodeURIComponent(urlB)}`);
      if (!res.ok) throw new Error('Could not retrieve analytics data.');
      const data = await res.json();
      setVideoData(data);
      
      // Inject welcome chat prompt
      setChatHistory([
        {
          role: 'assistant',
          content: `✨ **Analytics Ingested Successfully!** Side-by-side performance cards and transcript segments are now active.

📊 **Initial Summary**:
* **Video A (YouTube)** has an Engagement Rate of **${data.video_a.engagement_rate}%** on **${formatNumber(data.video_a.views)}** views.
* **Video B (Instagram)** has an Engagement Rate of **${data.video_b.engagement_rate}%** on **${formatNumber(data.video_b.views)}** views.

Feel free to click any of the suggested questions below, or ask custom questions about hooks, CTA scripts, and visual techniques!`
        }
      ]);
    } catch (err) {
      setErrorMessage('Failed to fetch processed data.');
    }
  };

  // Poll background task status
  const pollTaskStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (!res.ok) throw new Error('Polling failed');
        const data = await res.json();

        setTaskStatus(data.status);

        if (data.status === 'completed') {
          clearInterval(interval);
          setVideoData(data.result);
          
          setChatHistory([
            {
              role: 'assistant',
              content: `✨ **Analytics Ingested Successfully!**

📊 **Metrics Summary**:
* **Video A (YouTube)** has an Engagement Rate of **${data.result.video_a.engagement_rate}%**.
* **Video B (Instagram Reel)** has an Engagement Rate of **${data.result.video_b.engagement_rate}%**.

What would you like to compare? You can click a suggested question below or write a custom message.`
            }
          ]);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setErrorMessage(data.error_message || 'Video analysis failed.');
        }
      } catch (err) {
        clearInterval(interval);
        setTaskStatus('failed');
        setErrorMessage('Connection error while loading analytics.');
      }
    }, 2000);
  };

  // Streaming Chat handler
  const handleSendChat = async (queryText = null) => {
    const activeQuery = queryText || chatQuery;
    if (!activeQuery.trim() || isChatStreaming) return;
    if (taskStatus !== 'completed' || !videoData) {
      alert("Please upload and successfully process two videos before starting the chat.");
      return;
    }

    if (!queryText) setChatQuery('');

    // Append user message
    const updatedHistory = [...chatHistory, { role: 'user', content: activeQuery }];
    setChatHistory(updatedHistory);
    setIsChatStreaming(true);

    // Append loading assistant bubble
    setChatHistory(prev => [...prev, { role: 'assistant', content: 'Thinking...' }]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: activeQuery,
          video_a_url: videoAUrl,
          video_b_url: videoBUrl,
          history: updatedHistory.slice(0, -1) // Exclude the assistant message itself
        })
      });

      if (!res.ok) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value);
        // Process SSE lines
        const lines = textChunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) {
                assistantResponse += parsed.text;
                // Update last assistant message in history in real-time
                setChatHistory(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: assistantResponse };
                  return copy;
                });
              }
            } catch (e) {
              // Ignore parse errors on ping/metadata events
            }
          }
        }
      }
    } catch (err) {
      setChatHistory(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { 
          role: 'assistant', 
          content: `⚠️ **Connection Error**: ${err.message || 'The server failed to stream the response.'}` 
        };
        return copy;
      });
    } finally {
      setIsChatStreaming(false);
    }
  };

  // Custom renderer for Markdown-like citations
  const renderMessageContent = (content) => {
    // Regex matches [Video A @ 01:23] or [Video B @ 00:05]
    const citationRegex = /\[(Video [A|B])\s*@\s*(\d{2}:\d{2})\]/g;
    
    // Split text by citations
    const parts = content.split(citationRegex);
    if (parts.length === 1) {
      return <span>{content}</span>;
    }

    const elements = [];
    let textIndex = 0;
    
    // Parse loop
    // Every 3 items represent: [pre-text, videoName, timecode]
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 0) {
        elements.push(<span key={`txt-${i}`}>{parts[i]}</span>);
      } else if (i % 3 === 1) {
        const videoName = parts[i];
        const timestamp = parts[i+1];
        
        elements.push(
          <button 
            key={`cit-${i}`} 
            className="citation-link"
            title={`Jump to ${videoName} transcript timestamp`}
            onClick={() => {
              const videoPanel = document.querySelector(
                videoName === 'Video A' ? '.video-a-scroll' : '.video-b-scroll'
              );
              if (videoPanel) {
                // Find matching timestamp line inside scroll area
                const lines = videoPanel.textContent.split('\n');
                const matchedLine = lines.find(l => l.includes(timestamp));
                if (matchedLine) {
                  // Simple alert or scroll to indicate citation
                  alert(`📖 Deep Citation Match found in ${videoName} Transcript:\n\n"${matchedLine}"`);
                }
              }
            }}
          >
            <Video size={10} />
            {videoName} @ {timestamp}
          </button>
        );
        i++; // Skip the next index since we processed it (timestamp)
      }
    }
    
    return <div>{elements}</div>;
  };

  return (
    <div className="app-container">
      {/* Top Banner Input Section */}
      <header className="header-panel">
        <div className="header-top">
          <div className="title-section">
            <h1>🎬 Social Video Intelligence Dashboard</h1>
            <p>Production-Grade Side-by-Side RAG Analytics for YouTube Videos & Instagram Reels</p>
          </div>
          <div className="api-status">
            <span className={`status-dot ${healthStatus === 'healthy' ? '' : 'warning'}`}></span>
            <span>API Server: {healthStatus === 'healthy' ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
        </div>

        <form className="url-inputs-form" onSubmit={handleProcessVideos}>
          <div className="input-group">
            <label className="input-label video-a">Video A (YouTube URL)</label>
            <div className="input-wrapper">
              <Tv className="input-icon" />
              <input 
                type="text" 
                className="url-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoAUrl}
                onChange={(e) => setVideoAUrl(e.target.value)}
                disabled={taskStatus === 'pending' || taskStatus === 'processing'}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label video-b">Video B (Instagram Reel URL)</label>
            <div className="input-wrapper">
              <Instagram className="input-icon" />
              <input 
                type="text" 
                className="url-input"
                placeholder="https://www.instagram.com/reel/..."
                value={videoBUrl}
                onChange={(e) => setVideoBUrl(e.target.value)}
                disabled={taskStatus === 'pending' || taskStatus === 'processing'}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="submit-btn"
            disabled={taskStatus === 'pending' || taskStatus === 'processing' || !videoAUrl || !videoBUrl}
          >
            {taskStatus === 'pending' || taskStatus === 'processing' ? (
              <>
                <RefreshCw className="spinner" />
                Processing...
              </>
            ) : (
              <>
                <Activity size={18} />
                Analyze Performance
              </>
            )}
          </button>
        </form>
      </header>

      {/* Main Dashboard Layout */}
      <main className="dashboard-grid">
        {taskStatus === 'idle' && (
          <div className="empty-dashboard-state">
            <div className="empty-icon-glow">
              <Sparkles size={32} />
            </div>
            <h3>Awaiting Input URLs</h3>
            <p>
              Submit a YouTube URL and an Instagram Reel URL in the header bar above. We will download metadata, parse transcripts, calculate comparative engagement metrics, and initialize the conversational RAG chatbot.
            </p>
          </div>
        )}

        {(taskStatus === 'pending' || taskStatus === 'processing') && (
          <div className="empty-dashboard-state">
            <div className="big-loading-overlay">
              <RefreshCw className="spinner" style={{ width: '48px', height: '48px', color: 'var(--accent-blue)' }} />
              <h3>Analyzing Video Analytics & Transcripts</h3>
              <p>
                Downloading metadata, computing engagement algorithms, splitting script transcripts into semantic vector chunks, and seeding the database...
              </p>
              <div className="loading-bar-outer">
                <div className="loading-bar-inner"></div>
              </div>
            </div>
          </div>
        )}

        {taskStatus === 'failed' && (
          <div className="empty-dashboard-state" style={{ borderColor: 'var(--video-b-primary)' }}>
            <div className="empty-icon-glow" style={{ color: 'var(--video-b-primary)', boxShadow: '0 0 25px rgba(255, 8, 68, 0.1)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ color: 'var(--video-b-primary)' }}>Video Analysis Failed</h3>
            <p>{errorMessage || 'An error occurred while downloading video metadata. Please check the URLs and try again.'}</p>
            <button 
              className="submit-btn" 
              style={{ background: 'var(--video-b-grad)', marginTop: '0.5rem' }}
              onClick={() => setTaskStatus('idle')}
            >
              Reset Inputs
            </button>
          </div>
        )}

        {taskStatus === 'completed' && videoData && (
          <>
            {/* COLUMN 1: VIDEO A (YouTube) */}
            <section className="column-panel video-a-panel">
              <div className="panel-header a">
                <Tv size={18} style={{ color: 'var(--video-a-primary)' }} />
                <h2>YouTube Analytics</h2>
              </div>
              
              <div className="panel-content">
                <div className="video-preview-box">
                  {getYouTubeEmbedUrl(videoData.video_a.url) ? (
                    <iframe 
                      src={getYouTubeEmbedUrl(videoData.video_a.url)}
                      title="Video A player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <div className="iframe-placeholder">
                      <Play />
                      <span>YouTube Embed Unavailable</span>
                    </div>
                  )}
                </div>

                <div className="metrics-grid">
                  <div className="engagement-large-card">
                    <span className="engagement-gauge-value">{videoData.video_a.engagement_rate}%</span>
                    <span className="engagement-label" style={{ color: 'var(--video-a-primary)' }}>Engagement Rate</span>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><TrendingUp size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Views</span>
                      <span className="metric-value">{formatNumber(videoData.video_a.views)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><Heart size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Likes</span>
                      <span className="metric-value">{formatNumber(videoData.video_a.likes)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><MessageCircle size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Comments</span>
                      <span className="metric-value">{formatNumber(videoData.video_a.comments)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><Users size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Followers</span>
                      <span className="metric-value">{formatNumber(videoData.video_a.follower_count)}</span>
                    </div>
                  </div>
                </div>

                <div className="meta-list">
                  <div className="meta-header" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    📈 Video A Metadata
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Title</span>
                    <span className="meta-val" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {videoData.video_a.title}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Creator</span>
                    <span className="meta-val">{videoData.video_a.creator_name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Upload Date</span>
                    <span className="meta-val">{videoData.video_a.upload_date}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Duration</span>
                    <span className="meta-val">{videoData.video_a.duration}s</span>
                  </div>
                  <div className="hashtag-container">
                    {videoData.video_a.hashtags.map((h, i) => (
                      <span key={i} className="hashtag-tag">{h}</span>
                    ))}
                  </div>
                </div>

                <div className="transcript-box">
                  <div className="transcript-header">
                    <Clock size={12} />
                    <span>Script Transcript Chunks</span>
                  </div>
                  <div className="transcript-scroll video-a-scroll">
                    {videoData.video_a.transcript}
                  </div>
                </div>
              </div>
            </section>

            {/* COLUMN 2: VIDEO B (Instagram Reel) */}
            <section className="column-panel video-b-panel">
              <div className="panel-header b">
                <Instagram size={18} style={{ color: 'var(--video-b-primary)' }} />
                <h2>Instagram Reel Analytics</h2>
              </div>
              
              <div className="panel-content">
                <div className="video-preview-box" style={{ padding: '0.5rem' }}>
                  {getInstagramEmbedUrl(videoData.video_b.url) ? (
                    <iframe 
                      src={getInstagramEmbedUrl(videoData.video_b.url)}
                      title="Video B player"
                      scrolling="no"
                      allowtransparency="true"
                    ></iframe>
                  ) : (
                    <div className="iframe-placeholder">
                      <Play />
                      <span>Instagram Embed Blocked</span>
                    </div>
                  )}
                </div>

                <div className="metrics-grid">
                  <div className="engagement-large-card">
                    <span className="engagement-gauge-value">{videoData.video_b.engagement_rate}%</span>
                    <span className="engagement-label" style={{ color: 'var(--video-b-primary)' }}>Engagement Rate</span>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><TrendingUp size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Views</span>
                      <span className="metric-value">{formatNumber(videoData.video_b.views)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><Heart size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Likes</span>
                      <span className="metric-value">{formatNumber(videoData.video_b.likes)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><MessageCircle size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Comments</span>
                      <span className="metric-value">{formatNumber(videoData.video_b.comments)}</span>
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon-box"><Users size={16} /></div>
                    <div className="metric-details">
                      <span className="metric-label">Followers</span>
                      <span className="metric-value">{formatNumber(videoData.video_b.follower_count)}</span>
                    </div>
                  </div>
                </div>

                <div className="meta-list">
                  <div className="meta-header" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    📈 Video B Metadata
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Title</span>
                    <span className="meta-val" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {videoData.video_b.title}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Creator</span>
                    <span className="meta-val">{videoData.video_b.creator_name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Upload Date</span>
                    <span className="meta-val">{videoData.video_b.upload_date}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-key">Duration</span>
                    <span className="meta-val">{videoData.video_b.duration}s</span>
                  </div>
                  <div className="hashtag-container">
                    {videoData.video_b.hashtags.map((h, i) => (
                      <span key={i} className="hashtag-tag">{h}</span>
                    ))}
                  </div>
                </div>

                <div className="transcript-box">
                  <div className="transcript-header">
                    <Clock size={12} />
                    <span>Script Transcript Chunks</span>
                  </div>
                  <div className="transcript-scroll video-b-scroll">
                    {videoData.video_b.transcript}
                  </div>
                </div>
              </div>
            </section>

            {/* COLUMN 3: RAG INTERACTIVE CHAT PANEL */}
            <section className="column-panel chat-panel">
              <div className="panel-header c">
                <MessageSquare size={18} style={{ color: 'var(--accent-blue)' }} />
                <h2>Comparative AI Assistant (RAG)</h2>
              </div>

              <div className="chat-messages-container">
                {chatHistory.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`chat-bubble ${msg.role}`}
                  >
                    {msg.role === 'assistant' ? (
                      renderMessageContent(msg.content)
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                ))}
                {isChatStreaming && chatHistory[chatHistory.length - 1].content === 'Thinking...' && (
                  <div className="chat-bubble assistant" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    <span>Formulating comparison matrix...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Suggestions */}
              <div className="suggested-questions">
                {suggestedQuestions.map((q, idx) => (
                  <button 
                    key={idx} 
                    className="suggest-btn"
                    onClick={() => handleSendChat(q)}
                    disabled={isChatStreaming}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Input Chat Box */}
              <div className="chat-input-bar">
                <input 
                  type="text" 
                  className="chat-input"
                  placeholder="Ask about hook quality, script, differences..."
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendChat();
                  }}
                  disabled={isChatStreaming}
                />
                <button 
                  className="send-btn"
                  onClick={() => handleSendChat()}
                  disabled={isChatStreaming || !chatQuery.trim()}
                >
                  <Send size={16} />
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
