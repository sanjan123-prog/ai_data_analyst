import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from "recharts";
import { 
  Sparkles, Database, TrendingUp, ShieldCheck, FileText, 
  Send, RefreshCw, AlertTriangle, CheckCircle, Copy, Download, 
  Table, BarChart2, Zap, Server, Activity, ArrowUpRight, HelpCircle
} from "lucide-react";
import confetti from "canvas-confetti";

// Use environment variable for deployed production API, fallback to localhost:8001
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : "http://localhost:8001/api";

const PALETTE = ["#06b6d4", "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#38bdf8"];

export default function App() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("auto"); // "auto" | "chart" | "table"
  const [copiedSql, setCopiedSql] = useState(false);
  const [serverHealth, setServerHealth] = useState({ online: false, checking: true });

  // Machine Learning Churn State
  const [churnAccounts, setChurnAccounts] = useState([]);
  const [loadingChurn, setLoadingChurn] = useState(false);

  // RAG Document State
  const [ragQuestion, setRagQuestion] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [loadingRag, setLoadingRag] = useState(false);

  // Safe CRUD State
  const [crudTable, setCrudTable] = useState("customers");
  const [crudIndex, setCrudIndex] = useState("");
  const [crudName, setCrudName] = useState("");
  const [crudPreview, setCrudPreview] = useState(null);
  const [crudStatus, setCrudStatus] = useState(null);
  const [crudLoading, setCrudLoading] = useState(false);

  // Quick Curated Prompts
  const quickPrompts = [
    { title: "Revenue by Channel", q: "What is the total sales amount for each channel?" },
    { title: "Customer Count", q: "How many customers are there?" },
    { title: "Top 5 Products", q: "What are the top 5 products by total sales?" },
    { title: "Monthly Growth", q: "Show monthly sales trends over time." }
  ];

  // Check Backend Live Status
  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setServerHealth({ online: true, checking: false });
      } else {
        setServerHealth({ online: false, checking: false });
      }
    } catch {
      setServerHealth({ online: false, checking: false });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
        colors: ["#38bdf8", "#818cf8", "#c084fc"]
      });
    } catch (e) {
      // safe fallback
    }
  };

  const handleRunQuery = async (queryText) => {
    const q = queryText || query;
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.ok) {
        throw new Error(data.detail || data.error || `Server responded with HTTP ${res.status}`);
      }

      if (!data.success) {
        setError(data.error || "Failed to process analytics query.");
      } else {
        setResult(data);
        setViewMode("auto");
        if (data.visualization?.type === "kpi" || data.row_count > 0) {
          triggerConfetti();
        }
      }
    } catch (err) {
      setError(err.message || `Could not connect to the analytics backend at ${API_BASE}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = () => {
    if (!result?.sql) return;
    navigator.clipboard.writeText(result.sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleExportCsv = () => {
    if (!result?.records || result.records.length === 0) return;
    const headers = result.columns.join(",");
    const rows = result.records.map(row => 
      result.columns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analytics_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchChurnAccounts = async () => {
    setLoadingChurn(true);
    try {
      const res = await fetch(`${API_BASE}/ml/churn/high-risk?limit=6`);
      const data = await res.json();
      setChurnAccounts(data.high_risk_customers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChurn(false);
    }
  };

  const handleRagAsk = async () => {
    if (!ragQuestion.trim()) return;
    setLoadingRag(true);
    setRagResult(null);
    try {
      const res = await fetch(`${API_BASE}/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: ragQuestion })
      });
      const data = await res.json();
      setRagResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRag(false);
    }
  };

  const handleCrudPreview = async () => {
    if (!crudIndex || !crudName) return;
    setCrudLoading(true);
    setCrudStatus(null);
    try {
      const res = await fetch(`${API_BASE}/crud/preview/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: crudTable,
          data: { "Customer Index": parseInt(crudIndex), "Customer Names": crudName }
        })
      });
      const data = await res.json();
      setCrudPreview(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCrudLoading(false);
    }
  };

  const handleCrudConfirm = async (confirmed) => {
    if (!crudPreview) return;
    setCrudLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crud/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_object: crudPreview, confirmed })
      });
      const data = await res.json();
      setCrudStatus(data);
      setCrudPreview(null);
      if (confirmed && data.success) {
        triggerConfetti();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCrudLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ml") fetchChurnAccounts();
  }, [activeTab]);

  return (
    <div className="app-layout">
      {/* Sleek Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Brand Identity */}
          <div className="brand-badge">
            <div className="brand-icon-wrap">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="brand-title">Data Analyst AI</div>
              <div className="brand-subtitle">Business Intelligence</div>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="nav-group">
            <div 
              className={`nav-link ${activeTab === "analytics" ? "active" : ""}`}
              onClick={() => setActiveTab("analytics")}
            >
              <Database size={19} />
              <span>SQL Analytics</span>
            </div>

            <div 
              className={`nav-link ${activeTab === "ml" ? "active" : ""}`}
              onClick={() => setActiveTab("ml")}
            >
              <TrendingUp size={19} />
              <span>ML Churn Engine</span>
            </div>

            <div 
              className={`nav-link ${activeTab === "rag" ? "active" : ""}`}
              onClick={() => setActiveTab("rag")}
            >
              <FileText size={19} />
              <span>Policy RAG</span>
            </div>

            <div 
              className={`nav-link ${activeTab === "crud" ? "active" : ""}`}
              onClick={() => setActiveTab("crud")}
            >
              <ShieldCheck size={19} />
              <span>Safe CRUD</span>
            </div>
          </div>
        </div>

        {/* Server & Engine Telemetry Status */}
        <div className="system-status-box">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.5px" }}>
              ENGINE STATUS
            </span>
            <span 
              className="status-indicator" 
              style={{ backgroundColor: serverHealth.online ? "var(--accent-emerald)" : "var(--accent-rose)" }} 
            />
          </div>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {serverHealth.online ? "FastAPI Core Connected" : "Connecting to Backend..."}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            Gemini 3.1 Flash-Lite Active
          </div>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="main-canvas">
        {/* TAB 1: SQL ANALYTICS */}
        {activeTab === "analytics" && (
          <div>
            <header className="hero-header">
              <h1 className="hero-title">Talk to your enterprise data.</h1>
              <p className="hero-subtitle">
                Ask in plain English. We generate verified SQL, validate safety, execute in MySQL, and craft visualizations.
              </p>
            </header>

            {/* Smart Command Input */}
            <div className="ai-search-card">
              <div className="prompt-bar-wrap">
                <Zap size={20} color="var(--accent-cyan)" />
                <input 
                  type="text" 
                  className="prompt-input" 
                  placeholder="Ask a question (e.g. Which 5 products generated the highest revenue?)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
                />
                <button 
                  className="btn-glow-primary" 
                  onClick={() => handleRunQuery()} 
                  disabled={loading}
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                  <span>{loading ? "Synthesizing..." : "Analyze"}</span>
                </button>
              </div>

              {loading && <div className="shimmer-wave" />}

              {/* Curated Prompt Chips */}
              <div className="suggestions-wrap">
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginRight: "4px" }}>Try asking:</span>
                {quickPrompts.map((p, idx) => (
                  <div 
                    key={idx} 
                    className="suggestion-chip"
                    onClick={() => { setQuery(p.q); handleRunQuery(p.q); }}
                  >
                    <span>{p.title}</span>
                    <ArrowUpRight size={13} color="var(--accent-cyan)" />
                  </div>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="glass-panel" style={{ borderLeft: "4px solid var(--accent-rose)" }}>
                <div style={{ display: "flex", gap: "14px", alignItems: "center", color: "#fda4af" }}>
                  <AlertTriangle size={24} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>Query Failed</div>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "2px" }}>{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Verified Results Canvas */}
            {result && (
              <div className="glass-panel">
                {/* AI Grounded Insight Banner */}
                {result.explanation && (
                  <div className="insight-box">
                    <Sparkles size={22} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: "2px" }} />
                    <div className="insight-text">
                      {result.explanation}
                    </div>
                  </div>
                )}

                {/* SQL Drawer with One-Click Copy */}
                <div className="sql-drawer">
                  <div style={{ overflowX: "auto", paddingRight: "16px" }}>
                    <span style={{ color: "var(--text-muted)", marginRight: "8px" }}>SQL:</span>
                    <span>{result.sql}</span>
                  </div>
                  <button 
                    onClick={handleCopySql}
                    style={{ 
                      background: "rgba(255, 255, 255, 0.08)", 
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.8rem",
                      flexShrink: 0
                    }}
                  >
                    <Copy size={13} />
                    <span>{copiedSql ? "Copied!" : "Copy SQL"}</span>
                  </button>
                </div>

                {/* View Switcher & Export Header */}
                <div className="chart-header">
                  <div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                      {result.visualization?.title || "Query Result"}
                    </h3>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                      Executed against MySQL in {result.elapsed_seconds}s &bull; {result.row_count} records returned
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <div className="segmented-toggle">
                      <button 
                        className={`toggle-btn ${viewMode === "auto" || viewMode === "chart" ? "active" : ""}`}
                        onClick={() => setViewMode("chart")}
                      >
                        <BarChart2 size={14} />
                        <span>Visual</span>
                      </button>
                      <button 
                        className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
                        onClick={() => setViewMode("table")}
                      >
                        <Table size={14} />
                        <span>Table</span>
                      </button>
                    </div>

                    <button 
                      onClick={handleExportCsv}
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "10px",
                        padding: "8px 14px",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.85rem",
                        fontWeight: 500
                      }}
                    >
                      <Download size={14} />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                {/* Dynamic Visualization Rendering */}
                {(viewMode === "auto" || viewMode === "chart") && (
                  <div>
                    {result.visualization?.type === "kpi" && (
                      <div className="kpi-hero">
                        <div className="kpi-big-num">
                          {result.visualization.unit}{result.visualization.value?.toLocaleString()}
                        </div>
                        <div className="kpi-label">{result.visualization.title}</div>
                      </div>
                    )}

                    {result.visualization?.type === "bar" && (
                      <div style={{ height: "360px", margin: "20px 0" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={result.records}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                            <XAxis 
                              dataKey={result.visualization.xAxis} 
                              stroke="#64748b" 
                              tick={{ fill: '#94a3b8', fontSize: 12 }} 
                            />
                            <YAxis 
                              stroke="#64748b" 
                              tick={{ fill: '#94a3b8', fontSize: 12 }} 
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "rgba(10, 15, 28, 0.95)", 
                                borderColor: "rgba(99, 102, 241, 0.3)",
                                borderRadius: "10px",
                                boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                              }} 
                            />
                            <Bar 
                              dataKey={result.visualization.yAxis} 
                              fill="url(#auroraBar)" 
                              radius={[6, 6, 0, 0]} 
                            />
                            <defs>
                              <linearGradient id="auroraBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {result.visualization?.type === "line" && (
                      <div style={{ height: "360px", margin: "20px 0" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={result.records}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                            <XAxis 
                              dataKey={result.visualization.xAxis} 
                              stroke="#64748b" 
                              tick={{ fill: '#94a3b8', fontSize: 12 }} 
                            />
                            <YAxis 
                              stroke="#64748b" 
                              tick={{ fill: '#94a3b8', fontSize: 12 }} 
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "rgba(10, 15, 28, 0.95)", 
                                borderColor: "rgba(99, 102, 241, 0.3)",
                                borderRadius: "10px",
                                boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                              }} 
                            />
                            <Line 
                              type="monotone" 
                              dataKey={result.visualization.yAxis} 
                              stroke="#38bdf8" 
                              strokeWidth={3} 
                              dot={{ r: 5, fill: "#0c1222", stroke: "#38bdf8", strokeWidth: 2 }} 
                              activeDot={{ r: 8, fill: "#ec4899" }} 
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* Tabular Data View */}
                {(viewMode === "table" || result.visualization?.type === "table") && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="modern-table">
                      <thead>
                        <tr>
                          {result.columns.map((c, i) => (
                            <th key={i}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.records.map((row, idx) => (
                          <tr key={idx}>
                            {result.columns.map((col, cIdx) => (
                              <td key={cIdx}>
                                {typeof row[col] === "number" ? row[col].toLocaleString() : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MACHINE LEARNING CHURN */}
        {activeTab === "ml" && (
          <div>
            <header className="hero-header">
              <h1 className="hero-title">Predictive Customer Churn</h1>
              <p className="hero-subtitle">
                Supervised Random Forest classifier evaluating quarterly spend contraction (&gt;15% spend decline).
              </p>
            </header>

            <div className="glass-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>High Risk Enterprise Accounts</h3>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Calculated using multi-dimensional RFM and product variety features
                  </div>
                </div>
                <button 
                  className="btn-glow-primary"
                  onClick={fetchChurnAccounts}
                  disabled={loadingChurn}
                  style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                >
                  <RefreshCw className={loadingChurn ? "animate-spin" : ""} size={14} />
                  <span>Refresh Predictions</span>
                </button>
              </div>

              {loadingChurn ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  Evaluating customer feature embeddings...
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Predicted Churn Risk</th>
                        <th>Risk Tier</th>
                        <th>Recent Spend</th>
                        <th>Orders</th>
                        <th>Variety</th>
                      </tr>
                    </thead>
                    <tbody>
                      {churnAccounts.map((c, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: "white" }}>{c.customer_name}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ 
                                width: "60px", 
                                height: "6px", 
                                background: "rgba(255,255,255,0.1)", 
                                borderRadius: "4px",
                                overflow: "hidden"
                              }}>
                                <div style={{ 
                                  width: `${c.churn_risk_percent}%`, 
                                  height: "100%", 
                                  background: c.risk_tier === "High" ? "var(--accent-rose)" : "var(--accent-amber)" 
                                }} />
                              </div>
                              <span style={{ fontWeight: 700 }}>{c.churn_risk_percent}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={`risk-tag ${c.risk_tier.toLowerCase()}`}>
                              {c.risk_tier}
                            </span>
                          </td>
                          <td>${c.recent_spend.toLocaleString()}</td>
                          <td>{c.order_count}</td>
                          <td>{c.product_variety} skus</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: POLICY RAG */}
        {activeTab === "rag" && (
          <div>
            <header className="hero-header">
              <h1 className="hero-title">Grounded Policy Knowledge</h1>
              <p className="hero-subtitle">
                Ask questions answered strictly from uploaded logistics, refund, and shipping guidelines.
              </p>
            </header>

            <div className="ai-search-card">
              <div className="prompt-bar-wrap">
                <FileText size={20} color="var(--accent-purple)" />
                <input 
                  type="text" 
                  className="prompt-input" 
                  placeholder="e.g. According to the company refund policy, what is the refund period?"
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRagAsk()}
                />
                <button 
                  className="btn-glow-primary" 
                  style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
                  onClick={handleRagAsk} 
                  disabled={loadingRag}
                >
                  {loadingRag ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                  <span>{loadingRag ? "Retrieving..." : "Ask Policy"}</span>
                </button>
              </div>
            </div>

            {ragResult && (
              <div className="glass-panel">
                <div className="insight-box" style={{ borderLeftColor: "var(--accent-purple)" }}>
                  <Sparkles size={22} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
                  <div className="insight-text">
                    {ragResult.answer}
                  </div>
                </div>

                <div style={{ marginTop: "24px" }}>
                  <h4 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "1px", marginBottom: "12px" }}>
                    RETRIEVED VECTOR CITATIONS
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {ragResult.sources.map((s, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          padding: "10px 14px", 
                          background: "rgba(255, 255, 255, 0.03)", 
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <span style={{ fontSize: "0.9rem", color: "#93c5fd" }}>
                          &bull; {s.doc_name} &bull; Chunk #{s.chunk_id}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Match Confidence: {(s.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SAFE CRUD */}
        {activeTab === "crud" && (
          <div>
            <header className="hero-header">
              <h1 className="hero-title">Safe Transactional CRUD</h1>
              <p className="hero-subtitle">
                Guarded write operations on whitelist tables with pre-execution row impact estimates and rollback safety.
              </p>
            </header>

            <div className="glass-panel" style={{ maxWidth: "700px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px" }}>Insert Reference Record</h3>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Target Table:
                  </label>
                  <select 
                    className="prompt-input" 
                    style={{ 
                      width: "100%", 
                      background: "rgba(6, 9, 19, 0.8)", 
                      border: "1px solid var(--border-subtle)", 
                      padding: "10px 14px", 
                      borderRadius: "10px" 
                    }}
                    value={crudTable} 
                    onChange={(e) => setCrudTable(e.target.value)}
                  >
                    <option value="customers">customers</option>
                    <option value="products">products</option>
                    <option value="2017_budgets">2017_budgets</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Record Index:
                  </label>
                  <input 
                    type="number" 
                    className="prompt-input" 
                    style={{ 
                      width: "100%", 
                      background: "rgba(6, 9, 19, 0.8)", 
                      border: "1px solid var(--border-subtle)", 
                      padding: "10px 14px", 
                      borderRadius: "10px" 
                    }}
                    placeholder="e.g. 501"
                    value={crudIndex}
                    onChange={(e) => setCrudIndex(e.target.value)}
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Name / Description:
                  </label>
                  <input 
                    type="text" 
                    className="prompt-input" 
                    style={{ 
                      width: "100%", 
                      background: "rgba(6, 9, 19, 0.8)", 
                      border: "1px solid var(--border-subtle)", 
                      padding: "10px 14px", 
                      borderRadius: "10px" 
                    }}
                    placeholder="e.g. Acme Enterprise Solutions"
                    value={crudName}
                    onChange={(e) => setCrudName(e.target.value)}
                  />
                </div>
              </div>

              <button 
                className="btn-glow-primary"
                onClick={handleCrudPreview}
                disabled={crudLoading || !crudIndex || !crudName}
              >
                <ShieldCheck size={16} />
                <span>Estimate Impact & Preview Write</span>
              </button>

              {/* Guarded Confirmation Modal */}
              {crudPreview && (
                <div style={{ 
                  marginTop: "24px", 
                  padding: "20px", 
                  background: "rgba(245, 158, 11, 0.08)", 
                  border: "1px solid rgba(245, 158, 11, 0.35)", 
                  borderRadius: "14px" 
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-amber)", fontWeight: 700, marginBottom: "12px" }}>
                    <AlertTriangle size={20} />
                    <span>Action Required: Confirm Impact Before Committing</span>
                  </div>

                  <div className="sql-badge" style={{ marginBottom: "12px" }}>
                    {crudPreview.sql_preview}
                  </div>

                  <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Estimated affected rows: <strong style={{ color: "white" }}>{crudPreview.estimated_affected_rows}</strong>
                  </div>

                  <div style={{ display: "flex", gap: "12px" }}>
                    <button 
                      className="btn-glow-primary"
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                      onClick={() => handleCrudConfirm(true)}
                    >
                      Confirm & Execute
                    </button>
                    <button 
                      style={{ 
                        background: "rgba(255, 255, 255, 0.08)", 
                        border: "1px solid var(--border-subtle)", 
                        borderRadius: "10px", 
                        padding: "10px 20px", 
                        color: "var(--text-secondary)",
                        cursor: "pointer" 
                      }}
                      onClick={() => handleCrudConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {crudStatus && (
                <div style={{ marginTop: "20px", display: "flex", gap: "10px", alignItems: "center", color: "#34d399" }}>
                  <CheckCircle size={20} />
                  <span>{crudStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
