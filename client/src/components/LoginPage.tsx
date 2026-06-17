import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, Sun, Moon } from "lucide-react";
import { AppLanguage, translateUi } from "../utils/i18n";
import { LanguageSelector } from "./LanguageSelector";

const LOGO_PATH = "/assets/static/Logo AvtoLearn.svg";
interface LoginPageProps {
  darkMode: boolean;
  language: AppLanguage;
  onLogin: (email: string, password: string) => Promise<void>;
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = email.trim().length > 0 && password.trim().length > 0 && !loading;

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
    setError("");
    setLoading(true);
    onLogin(email.trim(), password)
      .then(() => {
      localStorage.setItem("avtolearn-remember-login", remember ? "true" : "false");
      })
      .catch(() => setError(translateUi("Email yoki parol noto'g'ri.", language)))
      .finally(() => setLoading(false));
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
          <span>{translateUi("Raqamli ta'lim portali", language)}</span>
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
            <span>{translateUi("Xavfsiz kirish", language)}</span>
            <strong>{translateUi("Online", language)}</strong>
          </div>
          <div className="login-card-head">
            <span className="login-lock"><Lock size={20} /></span>
            <div>
              <h2>{translateUi("Kabinetga kirish", language)}</h2>
              <p>{translateUi("AvtoLearn platformasiga xavfsiz ulaning.", language)}</p>
            </div>
          </div>

          <div className="login-mini-stats" aria-label="Login features">
            <span><ShieldCheck size={15} /> {translateUi("Himoyalangan kirish", language)}</span>
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
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" disabled={!canSubmit} type="submit">
            {loading ? translateUi("Kirish tekshirilmoqda...", language) : translateUi("Kirish", language)}
          </button>
        </form>
      </section>
    </main>
  );
}
