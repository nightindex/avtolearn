import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Sparkles, Sun, Moon } from "lucide-react";
import { AppLanguage, translateUi } from "../utils/i18n";
import { LanguageSelector } from "./LanguageSelector";

const LOGO_PATH = "/assets/static/Logo AvtoLearn.svg";
const DEMO_EMAIL = "i.muxtorov@avtolearn.uz";
const DEMO_PASSWORD = "avtolearn2026";

interface LoginPageProps {
  darkMode: boolean;
  language: AppLanguage;
  onLogin: () => void;
  setLanguage: (language: AppLanguage) => void;
  toggleTheme: () => void;
}

export function LoginPage({
  darkMode,
  language,
  onLogin,
  setLanguage,
  toggleTheme,
}: LoginPageProps) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = email.trim().length > 0 && password.trim().length > 0 && !loading;

  const handleAutofillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError("");
  };

  const submitLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(translateUi("Email va parolni kiriting.", language));
      return;
    }
    if (!emailValid) {
      setError(translateUi("Email formati noto'g'ri.", language));
      return;
    }
    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      setError(translateUi("Demo email yoki parol noto'g'ri.", language));
      return;
    }
    setError("");
    setLoading(true);
    window.setTimeout(() => {
      localStorage.setItem("avtolearn-remember-login", remember ? "true" : "false");
      setLoading(false);
      onLogin();
    }, 360);
  };

  return (
    <main className={`login-page ${darkMode ? "theme-dark" : "theme-light"}`}>
      <section className="login-brand-panel">
        <div className="login-brand">
          <img src={LOGO_PATH} alt="AvtoLearn" />
          <div>
            <strong>AVTOLEARN</strong>
            <span>{translateUi("O'quv platformasi", language)}</span>
          </div>
        </div>
        <div className="login-hero-copy">
          <span>{translateUi("Mahalliy demo", language)}</span>
          <h1>{translateUi("Bugungi mashg'ulotga tayyormisiz?", language)}</h1>
          <p>{translateUi("Shaxsiy progress, saqlangan testlar va AI yordamchi bilan tezkor kirish.", language)}</p>
        </div>
        <div className="login-feature-grid">
          <article>
            <strong>1 000+</strong>
            <span>{translateUi("Savollar bazasi", language)}</span>
          </article>
          <article>
            <strong>AI</strong>
            <span>{translateUi("AI izohlar", language)}</span>
          </article>
          <article>
            <strong>24/7</strong>
            <span>{translateUi("Online", language)}</span>
          </article>
        </div>
      </section>

      <section className="login-card-wrap">
        <div className="login-utility-bar">
          <LanguageSelector
            language={language}
            setLanguage={setLanguage}
            variant="login"
          />

          <button
            className={`icon-button login-theme-toggle ${darkMode ? "active" : ""}`}
            onClick={toggleTheme}
            title={translateUi(darkMode ? "Kunduzgi rejim" : "Tungi rejim", language)}
            type="button"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <form className="login-card" onSubmit={submitLogin}>
          <div className="login-card-top">
            <span>{translateUi("Xavfsiz demo kirish", language)}</span>
            <strong>{translateUi("Online", language)}</strong>
          </div>
          <div className="login-card-head">
            <span className="login-lock"><Lock size={20} /></span>
            <div>
              <h2>{translateUi("AvtoLearn kabinetiga kirish", language)}</h2>
              <p>{translateUi("Testlar, progress va AI tutor bir joyda.", language)}</p>
            </div>
          </div>

          <div className="login-mini-stats" aria-label="Login features">
            <span><ShieldAlert size={15} /> {translateUi("Demo kirish", language)}</span>
            <span><Sparkles size={15} /> AI Tutor</span>
          </div>

          <label className="login-field">
            <span>{translateUi("Email manzil", language)}</span>
            <div>
              <Mail size={17} />
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="namuna@avtolearn.uz"
                type="email"
                value={email}
              />
            </div>
          </label>

          <label className="login-field">
            <span>{translateUi("Parol", language)}</span>
            <div>
              <Lock size={17} />
              <input
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={translateUi(showPassword ? "Parolni yashirish" : "Parolni ko'rsatish", language)}
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <div className="login-options">
            <label>
              <input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
              <span>{translateUi("Eslab qolish", language)}</span>
            </label>
            <span>{translateUi("Demo kirish", language)}</span>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" disabled={!canSubmit} type="submit">
            {loading ? translateUi("Kirish tekshirilmoqda...", language) : translateUi("Kirish", language)}
          </button>

          <div
            className="login-demo"
            onClick={handleAutofillDemo}
            style={{ cursor: "pointer" }}
            title={translateUi("Demo ma'lumotlarini to'ldirish uchun bosing", language)}
          >
            <span>{translateUi("Demo kirish", language)} ({translateUi("To'ldirish uchun bosing", language)})</span>
            <strong>{DEMO_EMAIL}</strong>
            <strong>{DEMO_PASSWORD}</strong>
          </div>
        </form>
      </section>
    </main>
  );
}
