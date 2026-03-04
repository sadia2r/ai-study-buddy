import { useState, useEffect, useRef } from "react";

// ─── Styles injected globally ───────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,400&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #fdf6ec;
    --warm: #f5e6c8;
    --amber: #e8a838;
    --amber-deep: #c47c10;
    --teal: #2a7d6e;
    --teal-light: #3aa090;
    --teal-pale: #d4ede9;
    --ink: #1a1a2e;
    --ink-mid: #3d3d5c;
    --ink-soft: #7a7a99;
    --red-soft: #e85c50;
    --green-soft: #48bb78;
    --card-bg: #ffffff;
    --border: #e8ddd0;
    --shadow: 0 4px 24px rgba(26,26,46,0.10);
    --shadow-lg: 0 12px 48px rgba(26,26,46,0.16);
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    color: var(--ink);
    min-height: 100vh;
    background-image: radial-gradient(ellipse at 20% 0%, #fcecd4 0%, transparent 60%),
                      radial-gradient(ellipse at 80% 100%, #d4ede9 0%, transparent 60%);
  }

  .fraunces { font-family: 'Fraunces', serif; }

  /* Flip card */
  .flip-scene { perspective: 1000px; width: 100%; }
  .flip-card { width: 100%; transition: transform 0.6s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; position: relative; }
  .flip-card.flipped { transform: rotateY(180deg); }
  .flip-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 24px; }
  .flip-face.back { transform: rotateY(180deg); position: absolute; top: 0; left: 0; width: 100%; height: 100%; }

  /* Animations */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }

  .fade-up { animation: fadeUp .4s ease both; }
  .fade-up-1 { animation: fadeUp .4s .1s ease both; }
  .fade-up-2 { animation: fadeUp .4s .2s ease both; }
  .fade-up-3 { animation: fadeUp .4s .3s ease both; }
  .spinner { animation: spin 1s linear infinite; display: inline-block; }
  .pulsing { animation: pulse 1.5s ease infinite; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--warm); }
  ::-webkit-scrollbar-thumb { background: var(--amber); border-radius: 3px; }

  /* Drop zone */
  .drop-zone { border: 2.5px dashed var(--border); border-radius: 20px; transition: all .25s; cursor: pointer; }
  .drop-zone:hover, .drop-zone.dragging { border-color: var(--amber); background: #fff8ef; }

  /* Smooth file preview text */
  .text-preview {
    max-height: 180px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.7;
    color: var(--ink-mid);
    background: var(--warm);
    border-radius: 12px;
    padding: 14px 16px;
  }

  /* Progress bar */
  @keyframes progressSlide {
    from { width: 0%; }
    to   { width: 100%; }
  }
  .progress-bar { height: 3px; background: var(--amber); border-radius: 2px; animation: progressSlide 2s ease forwards; }

  /* Tab underline */
  .tab-active { border-bottom: 3px solid var(--amber); color: var(--ink); }
  .tab-inactive { border-bottom: 3px solid transparent; color: var(--ink-soft); }
  .tab-inactive:hover { color: var(--ink-mid); }
`;

function injectStyles(css) {
  if (typeof document === "undefined") return;
  const id = "study-buddy-styles";
  if (!document.getElementById(id)) {
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}

// ─── Tiny in-memory "DB" ─────────────────────────────────────────────────────
const DB = { notes: [], nextId: 1 };
function saveNote(filename, content) {
  const note = {
    id: DB.nextId++,
    filename,
    content,
    createdAt: new Date().toISOString(),
    flashcards: null,
    quiz: null,
  };
  DB.notes.push(note);
  return note;
}
function getNote(id) {
  return DB.notes.find((n) => n.id === id) || null;
}
function updateNote(id, patch) {
  const idx = DB.notes.findIndex((n) => n.id === id);
  if (idx !== -1) Object.assign(DB.notes[idx], patch);
}

// ─── Text extraction (browser-side) ─────────────────────────────────────────
async function extractText(file) {
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return await file.text();
  }
  if (file.name.endsWith(".pdf")) {
    // Use PDF.js from CDN
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const ab = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => it.str).join(" ") + "\n";
    }
    return text.trim();
  }
  // DOCX: mammoth
  if (file.name.endsWith(".docx")) {
    if (!window.mammoth) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src =
          "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const ab = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: ab });
    return result.value.trim();
  }
  throw new Error("Unsupported file type. Please use PDF, DOCX, or TXT.");
}

// ─── Claude API calls ─────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  const raw = data.choices[0].message.content;
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned);
}
```

And in your `.env.local` file, change it to:
```;
VITE_OPENAI_API_KEY = sk - yourrealopenaikeyhere;

async function generateFlashcards(noteContent, numCards = 12) {
  const system = `You are an expert study-aid generator. 
Return ONLY valid JSON. No markdown. No explanation. No extra text whatsoever.
Output shape:
{
  "title": "string",
  "cards": [
    { "question": "string", "answer": "string", "source_snippet": "string or null" }
  ]
}
Rules:
- All flashcards must be strictly grounded in the provided notes.
- source_snippet must be a short direct phrase (≤20 words) copied verbatim from the notes, or null if not applicable.
- Do NOT invent facts outside the notes.`;
  const user = `Generate exactly ${numCards} flashcards from these notes:\n\n${noteContent.slice(0, 12000)}`;
  return await callClaude(system, user);
}

async function generateQuiz(noteContent, numQuestions = 8) {
  const system = `You are an expert quiz generator.
Return ONLY valid JSON. No markdown. No explanation.
Output shape:
{
  "title": "string",
  "questions": [
    {
      "type": "mcq",
      "question": "string",
      "options": ["A","B","C","D"],
      "correct_index": 0,
      "explanation": "string"
    },
    {
      "type": "true_false",
      "question": "string",
      "answer": "True",
      "explanation": "string"
    },
    {
      "type": "short_answer",
      "question": "string",
      "model_answer": "string"
    }
  ]
}
Rules:
- Mix types: roughly 50% MCQ, 25% true/false, 25% short answer.
- All questions grounded strictly in the provided notes.
- MCQ must have exactly 4 options and correct_index 0–3.
- True/false answer must be exactly "True" or "False".`;
  const user = `Generate exactly ${numQuestions} quiz questions from these notes:\n\n${noteContent.slice(0, 12000)}`;
  return await callClaude(system, user);
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return (
    <span
      className="spinner"
      style={{
        width: size,
        height: size,
        border: `3px solid #e8ddd0`,
        borderTop: `3px solid #e8a838`,
        borderRadius: "50%",
        display: "inline-block",
      }}
    />
  );
}

function Alert({ type = "error", msg }) {
  const bg = type === "error" ? "#fff0ef" : "#f0fff8";
  const border = type === "error" ? "#e85c50" : "#48bb78";
  const icon = type === "error" ? "⚠️" : "✅";
  return (
    <div
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 14,
      }}
    >
      <span>{icon}</span>
      <span style={{ color: "var(--ink-mid)" }}>{msg}</span>
    </div>
  );
}

function Tag({ label, color = "amber" }) {
  const styles = {
    amber: { bg: "#fff3d6", text: "#b36a00" },
    teal: { bg: "#d4ede9", text: "#1a6b5e" },
    ink: { bg: "#ebebf5", text: "#3d3d5c" },
  };
  const s = styles[color] || styles.amber;
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        borderRadius: 8,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

// ─── Page: Upload ─────────────────────────────────────────────────────────────
function UploadPage({ onNoteCreated }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const allowed = [".pdf", ".docx", ".txt"];
    if (!allowed.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setError("Only PDF, DOCX, or TXT files are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const text = await extractText(file);
      if (text.length < 50)
        throw new Error("Couldn't extract enough text. Try a clearer file.");
      const note = saveNote(file.name, text);
      onNoteCreated(note.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      {/* Header */}
      <div
        className="fade-up"
        style={{ textAlign: "center", marginBottom: 48 }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
        <h1
          className="fraunces"
          style={{
            fontSize: "clamp(2rem,5vw,3.2rem)",
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          AI Study Buddy
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 16, maxWidth: 420 }}>
          Upload your notes and get flashcards + a quiz in seconds. Actually
          grounded in what you studied.
        </p>
      </div>

      {/* Upload card */}
      <div
        className="fade-up-1"
        style={{
          background: "var(--card-bg)",
          borderRadius: 28,
          boxShadow: "var(--shadow-lg)",
          padding: "40px 40px",
          width: "100%",
          maxWidth: 520,
        }}
      >
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          style={{ padding: "44px 20px", textAlign: "center" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div style={{ fontSize: 40, marginBottom: 14 }}>
            {file ? "📄" : "📎"}
          </div>
          {file ? (
            <>
              <p
                style={{
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 4,
                }}
              >
                {file.name}
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                {(file.size / 1024).toFixed(1)} KB · click to change
              </p>
            </>
          ) : (
            <>
              <p
                style={{
                  fontWeight: 600,
                  color: "var(--ink-mid)",
                  marginBottom: 6,
                }}
              >
                Drop your notes here
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                PDF, DOCX, or TXT · max 10MB
              </p>
            </>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 16 }}>
            <Alert msg={error} />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            marginTop: 24,
            width: "100%",
            padding: "15px 0",
            borderRadius: 14,
            border: "none",
            cursor: file && !loading ? "pointer" : "not-allowed",
            background:
              file && !loading
                ? "linear-gradient(135deg,#e8a838,#c47c10)"
                : "var(--border)",
            color: file && !loading ? "white" : "var(--ink-soft)",
            fontWeight: 600,
            fontSize: 16,
            fontFamily: "'DM Sans',sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all .2s",
            boxShadow:
              file && !loading ? "0 6px 20px rgba(232,168,56,.35)" : "none",
          }}
        >
          {loading ? (
            <>
              <Spinner />
              &nbsp; Extracting text…
            </>
          ) : (
            "Upload & Continue →"
          )}
        </button>

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--ink-soft)",
            marginTop: 18,
          }}
        >
          Notes are processed in your browser session only — nothing is stored
          permanently.
        </p>
      </div>

      {/* Previous notes */}
      {DB.notes.length > 0 && (
        <div
          className="fade-up-2"
          style={{ marginTop: 36, width: "100%", maxWidth: 520 }}
        >
          <p
            style={{
              fontWeight: 600,
              color: "var(--ink-mid)",
              marginBottom: 14,
              fontSize: 14,
            }}
          >
            Recent notes this session
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...DB.notes]
              .reverse()
              .slice(0, 4)
              .map((n) => (
                <button
                  key={n.id}
                  onClick={() => onNoteCreated(n.id)}
                  style={{
                    background: "var(--card-bg)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 14,
                    padding: "14px 18px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  >
                    📄 {n.filename}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    →
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page: Note Dashboard ─────────────────────────────────────────────────────
function NoteDashboard({ noteId, onStudy, onBack }) {
  const note = getNote(noteId);
  const [loadingFC, setLoadingFC] = useState(false);
  const [loadingQZ, setLoadingQZ] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [, forceRender] = useState(0);

  if (!note)
    return (
      <div style={{ padding: 40 }}>
        Note not found. <button onClick={onBack}>Go back</button>
      </div>
    );

  const handleFlashcards = async () => {
    setLoadingFC(true);
    setError(null);
    setSuccess(null);
    try {
      const deck = await generateFlashcards(note.content);
      updateNote(noteId, { flashcards: deck });
      setSuccess("Flashcards generated! Head to Study Mode. 🎉");
      forceRender((x) => x + 1);
    } catch (e) {
      setError("Failed to generate flashcards: " + e.message);
    } finally {
      setLoadingFC(false);
    }
  };

  const handleQuiz = async () => {
    setLoadingQZ(true);
    setError(null);
    setSuccess(null);
    try {
      const quiz = await generateQuiz(note.content);
      updateNote(noteId, { quiz });
      setSuccess("Quiz ready! Go to Study Mode to test yourself. ✏️");
      forceRender((x) => x + 1);
    } catch (e) {
      setError("Failed to generate quiz: " + e.message);
    } finally {
      setLoadingQZ(false);
    }
  };

  const fresh = getNote(noteId);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "40px 20px",
        maxWidth: 680,
        margin: "0 auto",
      }}
    >
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--ink-soft)",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 28,
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Back to upload
      </button>

      {/* Title card */}
      <div
        className="fade-up"
        style={{
          background: "var(--card-bg)",
          borderRadius: 24,
          boxShadow: "var(--shadow)",
          padding: "28px 32px",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2
              className="fraunces"
              style={{
                fontSize: "1.6rem",
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 6,
              }}
            >
              {note.filename}
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Uploaded {new Date(note.createdAt).toLocaleTimeString()} ·{" "}
              {(note.content.length / 1000).toFixed(1)}k characters extracted
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fresh.flashcards && (
              <Tag
                label={`${fresh.flashcards.cards.length} cards`}
                color="teal"
              />
            )}
            {fresh.quiz && (
              <Tag
                label={`${fresh.quiz.questions.length} questions`}
                color="amber"
              />
            )}
          </div>
        </div>

        <div className="text-preview" style={{ marginTop: 20 }}>
          {note.content.slice(0, 600)}
          {note.content.length > 600 ? "…" : ""}
        </div>
      </div>

      {/* Actions */}
      <div
        className="fade-up-1"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <ActionCard
          icon="🃏"
          title="Flashcards"
          desc={
            fresh.flashcards
              ? `${fresh.flashcards.cards.length} cards ready`
              : "Generate a deck from your notes"
          }
          loading={loadingFC}
          loadingText="Generating…"
          onClick={handleFlashcards}
          done={!!fresh.flashcards}
        />
        <ActionCard
          icon="✏️"
          title="Quiz"
          desc={
            fresh.quiz
              ? `${fresh.quiz.questions.length} questions ready`
              : "MCQ, true/false & short answer"
          }
          loading={loadingQZ}
          loadingText="Generating…"
          onClick={handleQuiz}
          done={!!fresh.quiz}
        />
      </div>

      {(error || success) && (
        <div style={{ marginBottom: 20 }}>
          {error && <Alert type="error" msg={error} />}
          {success && <Alert type="success" msg={success} />}
        </div>
      )}

      {/* Study button */}
      {(fresh.flashcards || fresh.quiz) && (
        <div className="fade-up-2">
          <button
            onClick={() => onStudy(noteId)}
            style={{
              width: "100%",
              padding: "16px 0",
              borderRadius: 16,
              border: "none",
              cursor: "pointer",
              background: "linear-gradient(135deg,#2a7d6e,#1a5a50)",
              color: "white",
              fontWeight: 700,
              fontSize: 17,
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 6px 24px rgba(42,125,110,.35)",
              transition: "all .2s",
            }}
          >
            🎓 Enter Study Mode →
          </button>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  loading,
  loadingText,
  onClick,
  done,
}) {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 20,
        boxShadow: "var(--shadow)",
        padding: "24px 22px",
        border: done ? "2px solid var(--teal-pale)" : "2px solid transparent",
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
      <h3
        style={{
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: 6,
          fontSize: 16,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-soft)",
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        {desc}
      </p>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 12,
          border: "none",
          cursor: loading ? "wait" : "pointer",
          background: done
            ? "var(--teal-pale)"
            : "linear-gradient(135deg,#e8a838,#c47c10)",
          color: done ? "var(--teal)" : "white",
          fontWeight: 600,
          fontSize: 14,
          fontFamily: "'DM Sans',sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all .2s",
        }}
      >
        {loading ? (
          <>
            <Spinner size={16} /> {loadingText}
          </>
        ) : done ? (
          "✓ Regenerate"
        ) : (
          "Generate"
        )}
      </button>
    </div>
  );
}

// ─── Page: Study Mode ─────────────────────────────────────────────────────────
function StudyMode({ noteId, onBack }) {
  const [tab, setTab] = useState("flashcards");
  const note = getNote(noteId);

  if (!note) return <div style={{ padding: 40 }}>Note not found.</div>;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "36px 20px",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--ink-soft)",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 24,
          padding: 0,
        }}
      >
        ← Back to dashboard
      </button>

      <div className="fade-up" style={{ marginBottom: 32 }}>
        <h2
          className="fraunces"
          style={{
            fontSize: "1.8rem",
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: 6,
          }}
        >
          Study Mode
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          {note.filename}
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          marginBottom: 32,
        }}
      >
        {["flashcards", "quiz"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "tab-active" : "tab-inactive"}
            style={{
              padding: "10px 24px",
              background: "none",
              border: "none",
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              textTransform: "capitalize",
              transition: "all .2s",
            }}
          >
            {t === "flashcards" ? "🃏 Flashcards" : "✏️ Quiz"}
            {t === "flashcards" && note.flashcards && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  background: "var(--teal-pale)",
                  color: "var(--teal)",
                  borderRadius: 8,
                  padding: "2px 7px",
                }}
              >
                {note.flashcards.cards.length}
              </span>
            )}
            {t === "quiz" && note.quiz && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  background: "#fff3d6",
                  color: "#b36a00",
                  borderRadius: 8,
                  padding: "2px 7px",
                }}
              >
                {note.quiz.questions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "flashcards" && <FlashcardStudy note={note} />}
      {tab === "quiz" && <QuizStudy note={note} />}
    </div>
  );
}

function FlashcardStudy({ note }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ knew: 0, didnt: 0 });

  if (!note.flashcards)
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>🃏</p>
        <p style={{ color: "var(--ink-soft)" }}>
          No flashcards yet. Go back and generate them!
        </p>
      </div>
    );

  const cards = note.flashcards.cards;
  const card = cards[idx];
  const total = cards.length;

  const next = (knew) => {
    if (knew !== undefined)
      setScore((s) => ({
        ...s,
        knew: s.knew + (knew ? 1 : 0),
        didnt: s.didnt + (knew ? 0 : 1),
      }));
    setFlipped(false);
    setTimeout(() => setIdx((i) => Math.min(i + 1, total - 1)), 220);
  };
  const prev = () => {
    setFlipped(false);
    setTimeout(() => setIdx((i) => Math.max(i - 1, 0)), 220);
  };

  const done = idx === total - 1 && flipped;

  return (
    <div>
      {/* Progress */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Card {idx + 1} of {total}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              color: "var(--green-soft)",
              fontWeight: 600,
            }}
          >
            ✓ {score.knew}
          </span>
          <span
            style={{ fontSize: 13, color: "var(--red-soft)", fontWeight: 600 }}
          >
            ✗ {score.didnt}
          </span>
        </div>
      </div>
      <div
        style={{
          background: "var(--border)",
          borderRadius: 4,
          height: 4,
          marginBottom: 28,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(idx / total) * 100}%`,
            height: "100%",
            background: "var(--amber)",
            borderRadius: 4,
            transition: "width .3s",
          }}
        />
      </div>

      {/* Card */}
      <div
        className="flip-scene"
        style={{ height: 320, marginBottom: 28 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className={`flip-card ${flipped ? "flipped" : ""}`}
          style={{ height: 320 }}
        >
          {/* Front */}
          <div
            className="flip-face"
            style={{
              height: 320,
              background: "linear-gradient(135deg,#fff8ef,#fff)",
              boxShadow: "var(--shadow-lg)",
              padding: "40px 36px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                color: "var(--amber)",
                textTransform: "uppercase",
                marginBottom: 20,
              }}
            >
              Question
            </span>
            <p
              className="fraunces"
              style={{
                fontSize: "1.25rem",
                color: "var(--ink)",
                lineHeight: 1.45,
                fontWeight: 400,
              }}
            >
              {card.question}
            </p>
            <p
              style={{ marginTop: 24, fontSize: 12, color: "var(--ink-soft)" }}
            >
              Click to reveal answer
            </p>
          </div>
          {/* Back */}
          <div
            className="flip-face back"
            style={{
              height: 320,
              background: "linear-gradient(135deg,#d4ede9,#e8f7f4)",
              boxShadow: "var(--shadow-lg)",
              padding: "32px 36px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                color: "var(--teal)",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Answer
            </span>
            <p
              style={{
                fontSize: "1.05rem",
                color: "var(--ink)",
                lineHeight: 1.55,
              }}
            >
              {card.answer}
            </p>
            {card.source_snippet && (
              <div
                style={{
                  marginTop: 20,
                  background: "rgba(255,255,255,.6)",
                  borderRadius: 10,
                  padding: "8px 14px",
                  borderLeft: "3px solid var(--teal)",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--teal)",
                    fontStyle: "italic",
                  }}
                >
                  "{card.source_snippet}"
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={prev}
          disabled={idx === 0}
          style={{
            padding: "11px 22px",
            borderRadius: 12,
            border: "1.5px solid var(--border)",
            background: "white",
            color: "var(--ink-mid)",
            fontFamily: "'DM Sans',sans-serif",
            fontWeight: 500,
            cursor: idx === 0 ? "not-allowed" : "pointer",
            opacity: idx === 0 ? 0.4 : 1,
          }}
        >
          ← Prev
        </button>
        {flipped && (
          <>
            <button
              onClick={() => next(false)}
              style={{
                padding: "11px 22px",
                borderRadius: 12,
                border: "none",
                background: "#fff0ef",
                color: "var(--red-soft)",
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✗ Didn't know
            </button>
            <button
              onClick={() => next(true)}
              style={{
                padding: "11px 22px",
                borderRadius: 12,
                border: "none",
                background: "#f0fff8",
                color: "var(--green-soft)",
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✓ Knew it!
            </button>
          </>
        )}
        {!flipped && (
          <button
            onClick={() => next(undefined)}
            disabled={idx === total - 1}
            style={{
              padding: "11px 22px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#e8a838,#c47c10)",
              color: "white",
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 600,
              cursor: idx === total - 1 ? "not-allowed" : "pointer",
              opacity: idx === total - 1 ? 0.4 : 1,
            }}
          >
            Skip →
          </button>
        )}
      </div>

      {/* Final score */}
      {idx === total - 1 && (
        <div
          style={{
            marginTop: 32,
            background: "var(--card-bg)",
            borderRadius: 20,
            padding: "24px 28px",
            textAlign: "center",
            boxShadow: "var(--shadow)",
            border: "1.5px solid var(--border)",
          }}
        >
          <p style={{ fontSize: 28, marginBottom: 10 }}>🎉</p>
          <p
            className="fraunces"
            style={{
              fontSize: "1.3rem",
              fontWeight: 700,
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            Session stats
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>
            <span style={{ color: "var(--green-soft)", fontWeight: 700 }}>
              {score.knew} knew
            </span>
            {" · "}
            <span style={{ color: "var(--red-soft)", fontWeight: 700 }}>
              {score.didnt} didn't
            </span>
            {" · "}
            {total - score.knew - score.didnt} skipped
          </p>
          <button
            onClick={() => {
              setIdx(0);
              setFlipped(false);
              setScore({ knew: 0, didnt: 0 });
            }}
            style={{
              marginTop: 18,
              padding: "11px 28px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#e8a838,#c47c10)",
              color: "white",
              fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              cursor: "pointer",
            }}
          >
            Restart deck
          </button>
        </div>
      )}
    </div>
  );
}

function QuizStudy({ note }) {
  const [answers, setAnswers] = useState({});
  const [shortInputs, setShortInputs] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  if (!note.quiz)
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>✏️</p>
        <p style={{ color: "var(--ink-soft)" }}>
          No quiz yet. Go back and generate one!
        </p>
      </div>
    );

  const questions = note.quiz.questions;

  const handleSubmit = () => {
    let s = 0;
    questions.forEach((q, i) => {
      if (q.type === "mcq" && answers[i] === q.correct_index) s++;
      if (q.type === "true_false" && answers[i] === q.answer) s++;
      // short answer: counted as attempted
    });
    setScore(s);
    setSubmitted(true);
  };

  const reset = () => {
    setAnswers({});
    setShortInputs({});
    setSubmitted(false);
    setScore(0);
  };

  const gradeable = questions.filter((q) => q.type !== "short_answer").length;
  const pct = gradeable ? Math.round((score / gradeable) * 100) : 0;

  return (
    <div>
      {submitted && (
        <div
          className="fade-up"
          style={{
            background: pct >= 70 ? "#f0fff8" : "#fff8ef",
            border: `1.5px solid ${pct >= 70 ? "var(--green-soft)" : "var(--amber)"}`,
            borderRadius: 18,
            padding: "22px 28px",
            marginBottom: 28,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 36, marginBottom: 8 }}>
            {pct >= 80 ? "🏆" : pct >= 60 ? "👍" : "💪"}
          </p>
          <p
            className="fraunces"
            style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" }}
          >
            {score}/{gradeable} correct · {pct}%
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
            Short answer questions not auto-graded — review them below.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 24px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#e8a838,#c47c10)",
              color: "white",
              fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              cursor: "pointer",
            }}
          >
            Retake quiz
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {questions.map((q, i) => (
          <QuizQuestion
            key={i}
            q={q}
            idx={i}
            answer={answers[i]}
            shortInput={shortInputs[i] || ""}
            submitted={submitted}
            onAnswer={(v) => setAnswers((a) => ({ ...a, [i]: v }))}
            onShortInput={(v) => setShortInputs((s) => ({ ...s, [i]: v }))}
          />
        ))}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          style={{
            marginTop: 32,
            width: "100%",
            padding: "15px 0",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg,#2a7d6e,#1a5a50)",
            color: "white",
            fontWeight: 700,
            fontSize: 17,
            fontFamily: "'DM Sans',sans-serif",
            boxShadow: "0 6px 24px rgba(42,125,110,.3)",
          }}
        >
          Submit Quiz
        </button>
      )}
    </div>
  );
}

function QuizQuestion({
  q,
  idx,
  answer,
  shortInput,
  submitted,
  onAnswer,
  onShortInput,
}) {
  const isCorrect = () => {
    if (q.type === "mcq") return answer === q.correct_index;
    if (q.type === "true_false") return answer === q.answer;
    return null;
  };
  const correct = submitted ? isCorrect() : null;
  const borderColor =
    submitted && q.type !== "short_answer"
      ? correct
        ? "var(--green-soft)"
        : "var(--red-soft)"
      : "var(--border)";

  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 20,
        padding: "24px 26px",
        boxShadow: "var(--shadow)",
        border: `1.5px solid ${borderColor}`,
        transition: "border-color .3s",
      }}
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <span
          style={{
            fontWeight: 700,
            color: "var(--amber)",
            fontSize: 14,
            minWidth: 24,
          }}
        >
          Q{idx + 1}
        </span>
        <div>
          <Tag
            label={
              q.type === "mcq"
                ? "Multiple Choice"
                : q.type === "true_false"
                  ? "True / False"
                  : "Short Answer"
            }
            color={
              q.type === "mcq"
                ? "amber"
                : q.type === "true_false"
                  ? "teal"
                  : "ink"
            }
          />
        </div>
      </div>
      <p
        style={{
          fontWeight: 500,
          color: "var(--ink)",
          lineHeight: 1.55,
          marginBottom: 18,
        }}
      >
        {q.question}
      </p>

      {q.type === "mcq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map((opt, oi) => {
            const selected = answer === oi;
            const isWinner = submitted && oi === q.correct_index;
            const isWrong = submitted && selected && oi !== q.correct_index;
            return (
              <button
                key={oi}
                onClick={() => !submitted && onAnswer(oi)}
                style={{
                  textAlign: "left",
                  padding: "11px 16px",
                  borderRadius: 12,
                  cursor: submitted ? "default" : "pointer",
                  border: `1.5px solid ${isWinner ? "var(--green-soft)" : isWrong ? "var(--red-soft)" : selected ? "var(--amber)" : "var(--border)"}`,
                  background: isWinner
                    ? "#f0fff8"
                    : isWrong
                      ? "#fff0ef"
                      : selected
                        ? "#fff8ef"
                        : "white",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 14,
                  color: "var(--ink)",
                  transition: "all .15s",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    marginRight: 10,
                    color: "var(--ink-soft)",
                  }}
                >
                  {String.fromCharCode(65 + oi)}.
                </span>
                {opt}
                {isWinner && <span style={{ marginLeft: 8 }}>✓</span>}
                {isWrong && <span style={{ marginLeft: 8 }}>✗</span>}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "true_false" && (
        <div style={{ display: "flex", gap: 12 }}>
          {["True", "False"].map((tf) => {
            const selected = answer === tf;
            const isWinner = submitted && tf === q.answer;
            const isWrong = submitted && selected && tf !== q.answer;
            return (
              <button
                key={tf}
                onClick={() => !submitted && onAnswer(tf)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  cursor: submitted ? "default" : "pointer",
                  border: `1.5px solid ${isWinner ? "var(--green-soft)" : isWrong ? "var(--red-soft)" : selected ? "var(--amber)" : "var(--border)"}`,
                  background: isWinner
                    ? "#f0fff8"
                    : isWrong
                      ? "#fff0ef"
                      : selected
                        ? "#fff8ef"
                        : "white",
                  fontFamily: "'DM Sans',sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "var(--ink)",
                  transition: "all .15s",
                }}
              >
                {tf} {isWinner && "✓"}
                {isWrong && "✗"}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "short_answer" && (
        <div>
          <textarea
            value={shortInput}
            onChange={(e) => onShortInput(e.target.value)}
            disabled={submitted}
            placeholder="Type your answer here…"
            style={{
              width: "100%",
              minHeight: 80,
              borderRadius: 12,
              border: "1.5px solid var(--border)",
              padding: "12px 14px",
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 14,
              color: "var(--ink)",
              resize: "vertical",
              outline: "none",
            }}
          />
          {submitted && (
            <div
              style={{
                marginTop: 12,
                background: "#d4ede9",
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--teal)",
                  marginBottom: 4,
                }}
              >
                Model Answer
              </p>
              <p style={{ fontSize: 14, color: "var(--ink-mid)" }}>
                {q.model_answer}
              </p>
            </div>
          )}
        </div>
      )}

      {submitted && q.explanation && q.type !== "short_answer" && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px solid var(--border)",
            paddingTop: 14,
          }}
        >
          <p
            style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}
          >
            💡 {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── App shell / router ───────────────────────────────────────────────────────
export default function App() {
  injectStyles(GLOBAL_CSS);
  const [page, setPage] = useState("upload"); // upload | dashboard | study
  const [activeNoteId, setActiveNoteId] = useState(null);

  const goToNote = (id) => {
    setActiveNoteId(id);
    setPage("dashboard");
  };
  const goToStudy = (id) => {
    setActiveNoteId(id);
    setPage("study");
  };
  const goToDash = () => setPage("dashboard");
  const goToUpload = () => setPage("upload");

  return (
    <div style={{ minHeight: "100vh" }}>
      {page === "upload" && <UploadPage onNoteCreated={goToNote} />}
      {page === "dashboard" && (
        <NoteDashboard
          noteId={activeNoteId}
          onStudy={goToStudy}
          onBack={goToUpload}
        />
      )}
      {page === "study" && (
        <StudyMode noteId={activeNoteId} onBack={goToDash} />
      )}
    </div>
  );
}
