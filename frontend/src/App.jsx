import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from "recharts";
import { 
  Database, LineChart as ChartIcon, FileText, Settings, 
  Send, Sparkles, AlertTriangle, CheckCircle, Download, RefreshCw 
} from "lucide-react";

const API_BASE = "http://localhost:8001/api";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

export default function App() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Machine Learning Churn State
  const [churnAccounts, setChurnAccounts] = useState([]);
  const [loadingChurn, setLoadingChurn] = useState(false);

  // RAG Document State
  const [ragQuestion, setRagQuestion] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [loadingRag, setLoadingRag] = useState(false);

  // CRUD State
  const [crudTable, setCrudTable] = useState("customers");
  const [crudIndex, setCrudIndex] = useState("");
  const [crudName, setCrudName] = useState("");
  const [crudPreview, setCrudPreview] = useState(null);
  const [crudStatus, setCrudStatus] = useState(null);

  const sampleQueries = [
    "What is the total sales amount for each channel?",
    "How many customers are there?",
    "Show monthly sales trend over time",
    "What are the top 5 products by total sales?"
  ];

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
      } catch (parseErr) {
        throw new Error(`Server returned HTTP ${res.status} (${res.statusText}) with invalid response format.`);
      }

      if (!res.ok) {
        throw new Error(data.detail || data.error || `Server responded with HTTP ${res.status}: ${res.statusText}`);
      }

      if (!data.success) {
        setError(data.error || "Failed to execute query");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred while communicating with the analytics backend.");
    } finally {
      setLoading(false);
    }
  };

  const fetchChurnAccounts = async () => {
    setLoadingChurn(true);
    try {
      const res = await fetch(`${API_BASE}/ml/churn/high-risk?limit=5`);
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
    }
  };

  const handleCrudConfirm = async (confirmed) => {
    if (!crudPreview) return;
    try {
      const res = await fetch(`${API_BASE}/crud/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_object: crudPreview, confirmed })
      });
      const data = await res.json();
      setCrudStatus(data);
      setCrudPreview(null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === "ml") fetchChurnAccounts();
  }, [activeTab]);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo-container">
          <Sparkles color="#3b82f6" size={26} />
          <span className="logo-text">AI Data Analyst</span>
        </div>
        <div 
          className={`nav-item ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <Database size={18} />
          <span>Analytics & SQL</span>
        </div>
        <div 
          className={`nav-item ${activeTab === "ml" ? "active" : ""}`}
          onClick={() => setActiveTab("ml")}
        >
          <ChartIcon size={18} />
          <span>ML Churn Risk</span>
        </div>
        <div 
          className={`nav-item ${activeTab === "rag" ? "active" : ""}`}
          onClick={() => setActiveTab("rag")}
        >
          <FileText size={18} />
          <span>Policy Documents</span>
        </div>
        <div 
          className={`nav-item ${activeTab === "crud" ? "active" : ""}`}
          onClick={() => setActiveTab("crud")}
        >
          <Settings size={18} />
          <span>Safe CRUD Control</span>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="main-content">
        {activeTab === "analytics" && (
          <div>
            <div className="query-box-container">
              <div className="input-row">
                <input 
                  type="text" 
                  className="query-input" 
                  placeholder="Ask a question about your sales, products, or channels in plain English..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
                />
                <button className="btn-primary" onClick={() => handleRunQuery()} disabled={loading}>
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                  <span>{loading ? "Analyzing..." : "Ask"}</span>
                </button>
              </div>

              <div className="suggested-chips">
                {sampleQueries.map((q, idx) => (
                  <div key={idx} className="chip" onClick={() => { setQuery(q); handleRunQuery(q); }}>
                    {q}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="result-card" style={{ borderLeft: "4px solid #ef4444" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", color: "#f87171" }}>
                  <AlertTriangle size={20} />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {result && (
              <div className="result-card">
                {/* Grounded Natural Language Explanation */}
                {result.explanation && (
                  <div className="explanation-banner">
                    {result.explanation}
                  </div>
                )}

                {/* Generated Verified SQL */}
                <div className="sql-badge">
                  {result.sql}
                </div>

                {/* Dynamic Auto-Selected Visualization */}
                {result.visualization?.type === "kpi" && (
                  <div className="kpi-container">
                    <div>
                      <div className="kpi-value">
                        {result.visualization.unit}{result.visualization.value.toLocaleString()}
                      </div>
                      <div className="kpi-title">{result.visualization.title}</div>
                    </div>
                  </div>
                )}

                {result.visualization?.type === "bar" && (
                  <div style={{ height: "340px", margin: "24px 0" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.records}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey={result.visualization.xAxis} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                        <Bar dataKey={result.visualization.yAxis} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {result.visualization?.type === "line" && (
                  <div style={{ height: "340px", margin: "24px 0" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={result.records}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey={result.visualization.xAxis} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                        <Line type="monotone" dataKey={result.visualization.yAxis} stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Tabular Data View */}
                <div style={{ marginTop: "24px" }}>
                  <h4 style={{ color: "#94a3b8", marginBottom: "12px", fontSize: "0.9rem" }}>
                    RETURNED RECORDS ({result.row_count})
                  </h4>
                  <table className="data-table">
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
              </div>
            )}
          </div>
        )}

        {/* Machine Learning Tab */}
        {activeTab === "ml" && (
          <div className="result-card">
            <h2 style={{ marginBottom: "8px" }}>Customer Churn Risk Model (Random Forest)</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
              Identifies B2B enterprise accounts showing statistical quarterly spend contraction (&gt;15% drop-off).
            </p>

            {loadingChurn ? (
              <p>Evaluating inference models...</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Predicted Churn Risk</th>
                    <th>Risk Tier</th>
                    <th>Recent Spend</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {churnAccounts.map((c, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{c.customer_name}</td>
                      <td>
                        <span style={{ 
                          color: c.risk_tier === "High" ? "#f87171" : "#fbbf24",
                          fontWeight: 700 
                        }}>
                          {c.churn_risk_percent}%
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          backgroundColor: c.risk_tier === "High" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                          color: c.risk_tier === "High" ? "#f87171" : "#fbbf24"
                        }}>
                          {c.risk_tier}
                        </span>
                      </td>
                      <td>${c.recent_spend.toLocaleString()}</td>
                      <td>{c.order_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Policy Documents Tab */}
        {activeTab === "rag" && (
          <div>
            <div className="query-box-container">
              <h2 style={{ marginBottom: "8px" }}>Company Document Q&A (RAG)</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
                Answers grounded strictly in uploaded company procedural documents and logistics guidelines.
              </p>
              <div className="input-row">
                <input 
                  type="text" 
                  className="query-input" 
                  placeholder="e.g. According to the company refund policy, what is the refund period?"
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                />
                <button className="btn-primary" onClick={handleRagAsk} disabled={loadingRag}>
                  <span>{loadingRag ? "Searching..." : "Retrieve"}</span>
                </button>
              </div>
            </div>

            {ragResult && (
              <div className="result-card">
                <div className="explanation-banner">
                  {ragResult.answer}
                </div>
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "8px" }}>
                    RETRIEVED CITATIONS:
                  </h4>
                  {ragResult.sources.map((s, idx) => (
                    <div key={idx} style={{ fontSize: "0.85rem", color: "#60a5fa" }}>
                      &bull; {s.doc_name} (Chunk #{s.chunk_id}) - Match Confidence: {(s.similarity * 100).toFixed(1)}%
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Safe CRUD Operations Tab */}
        {activeTab === "crud" && (
          <div className="result-card">
            <h2 style={{ marginBottom: "8px" }}>Safe Two-Step Database Write Operations</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
              Insert, update, or remove records on approved reference tables with pre-execution safety preview and transaction rollback.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "600px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Target Table:
                </label>
                <select 
                  className="query-input" 
                  style={{ width: "100%" }}
                  value={crudTable} 
                  onChange={(e) => setCrudTable(e.target.value)}
                >
                  <option value="customers">customers</option>
                  <option value="products">products</option>
                  <option value="2017_budgets">2017_budgets</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Index / ID:
                </label>
                <input 
                  type="number" 
                  className="query-input" 
                  style={{ width: "100%" }} 
                  placeholder="e.g. 500"
                  value={crudIndex}
                  onChange={(e) => setCrudIndex(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Name / Description:
                </label>
                <input 
                  type="text" 
                  className="query-input" 
                  style={{ width: "100%" }} 
                  placeholder="e.g. Acme Global Logistics"
                  value={crudName}
                  onChange={(e) => setCrudName(e.target.value)}
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <button className="btn-primary" onClick={handleCrudPreview}>
                  Generate Safe Preview
                </button>
              </div>
            </div>

            {/* Impact Estimation & Confirmation Modal */}
            {crudPreview && (
              <div style={{ 
                marginTop: "24px", 
                padding: "20px", 
                backgroundColor: "#0b1120", 
                borderRadius: "8px", 
                border: "1px solid #eab308" 
              }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#facc15", marginBottom: "12px" }}>
                  <AlertTriangle size={20} />
                  <span style={{ fontWeight: 600 }}>Action Required: Confirm Database Write</span>
                </div>
                <div className="sql-badge">{crudPreview.sql_preview}</div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "16px" }}>
                  Estimated affected rows: <strong>{crudPreview.estimated_affected_rows}</strong>
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button 
                    className="btn-primary" 
                    style={{ backgroundColor: "#10b981" }}
                    onClick={() => handleCrudConfirm(true)}
                  >
                    Confirm & Execute
                  </button>
                  <button 
                    className="btn-primary" 
                    style={{ backgroundColor: "#475569" }}
                    onClick={() => handleCrudConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {crudStatus && (
              <div style={{ marginTop: "20px", display: "flex", gap: "8px", alignItems: "center", color: "#34d399" }}>
                <CheckCircle size={18} />
                <span>{crudStatus.message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
