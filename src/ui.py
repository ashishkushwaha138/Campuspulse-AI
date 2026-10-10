"""Shared CampusPulse visual theme and reusable page components."""

from __future__ import annotations

import streamlit as st


def inject_theme() -> None:
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
        :root{--bg:#0a1020;--panel:#121c2d;--line:#29384e;--muted:#92a3b9;--cyan:#50c7d8;--mint:#48c89b;--amber:#f0b94f;--red:#fb7185;--violet:#9184ff}
        html,body,[class*="css"]{font-family:'DM Sans',sans-serif} .stApp{background:radial-gradient(ellipse at 80% 0%,#172345 0%,transparent 37%),var(--bg);color:#edf3fc}
        [data-testid="stSidebar"]{background:#0c1525;border-right:1px solid #223149} [data-testid="stSidebar"]>div:first-child{padding-top:1.4rem}
        h1,h2,h3{font-family:'Manrope',sans-serif;letter-spacing:-.025em;color:#f3f6fc} h1{font-size:2rem!important} h2{font-size:1.35rem!important} h3{font-size:1.05rem!important}
        p,.stMarkdown{color:#c4d0df} [data-testid="stCaptionContainer"]{color:var(--muted)}
        [data-testid="stMetric"]{background:transparent} [data-testid="stDataFrame"]{border:1px solid var(--line);border-radius:12px;overflow:hidden}
        [data-testid="stVerticalBlock"]>div:has(>.kpi-card){height:100%}
        .brand{display:flex;align-items:center;gap:11px;font:800 1.25rem 'Manrope',sans-serif;color:#f5f6ff;letter-spacing:-.04em}.brand-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#7669f8,#37b8ca);color:white;font-size:1.2rem;box-shadow:0 6px 20px #4f62de55}.brand small{display:block;color:#8091ad;font:600 .58rem 'DM Sans',sans-serif;letter-spacing:.18em;margin-top:2px}
        .page-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #223149;padding:.3rem 0 1.1rem;margin-bottom:1.8rem;color:#8ca0bb;font-size:.82rem}.page-top b{color:#edf3fc}.mode-chip{border:1px solid #2c3b54;background:#142033;color:#9dd8df;border-radius:99px;padding:6px 12px;font-size:.72rem}
        .subhead{color:#9caec5;margin-top:-.7rem;margin-bottom:1.3rem}.kpi-card{height:124px;background:linear-gradient(145deg,#152137,#111a2a);border:1px solid #29384e;border-top:3px solid #50c7d8;border-radius:13px;padding:16px 17px;box-shadow:0 10px 30px #03081438}.kpi-card.amber{border-top-color:var(--amber)}.kpi-card.red{border-top-color:var(--red)}.kpi-card.green{border-top-color:var(--mint)}.kpi-card.violet{border-top-color:var(--violet)}.kpi-label{font-size:.68rem;color:#91a3bd;letter-spacing:.09em;font-weight:700}.kpi-value{font:800 1.85rem 'Manrope',sans-serif;color:#f4f7fc;margin:7px 0 1px}.kpi-note{font-size:.72rem;color:#899ab1}
        .insight-banner{display:flex;flex-direction:column;gap:5px;margin:20px 0 24px;padding:16px 19px;border-radius:12px;background:linear-gradient(100deg,#201f42,#15243a);border:1px solid #39385d;border-left:3px solid var(--violet)}.insight-banner b{color:#dedbff}.insight-banner span{color:#aab7cc;font-size:.86rem}
        .stButton>button{border-radius:9px;border:1px solid #31415b;background:#17243a;color:#e9eff8}.stButton>button:hover{border-color:var(--cyan);color:#fff}.stButton>button[kind="primary"]{background:linear-gradient(110deg,#6359dd,#478cc8);border:0}
        .stTextInput input,.stNumberInput input,.stSelectbox [data-baseweb="select"]>div,.stMultiSelect [data-baseweb="select"]>div{background:#111d30;border-color:#30405a;color:#edf3fc}
        .risk-pill{display:inline-block;padding:4px 9px;border-radius:99px;font-weight:700;font-size:.72rem}.risk-pill.high{background:#46242f;color:#ff9eab}.risk-pill.medium{background:#42351e;color:#f5ca70}.risk-pill.low{background:#173a32;color:#72ddb7}
        .model-note{border:1px solid #34415a;background:#111b2c;padding:14px 17px;border-radius:11px;color:#9fb0c6;font-size:.82rem}
        .stTabs [data-baseweb="tab-list"]{gap:10px}.stTabs [data-baseweb="tab"]{background:#111c2d;border-radius:9px;color:#aebbd0}.stTabs [aria-selected="true"]{background:#242349;color:#d5d0ff}
        @media(max-width:900px){.kpi-card{height:auto;min-height:112px}.page-top{align-items:flex-start;gap:10px}}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_brand() -> None:
    st.markdown("<div class='brand'><span class='brand-icon'>C</span><span>CampusPulse AI<small>STUDENT SUCCESS PLATFORM</small></span></div>", unsafe_allow_html=True)


def render_header(page_name: str, data_mode: str) -> None:
    st.markdown(f"<div class='page-top'><span>Workspace　/　<b>{page_name}</b></span><span class='mode-chip'>● {data_mode}</span></div>", unsafe_allow_html=True)


def metric_card(label: str, value: str, note: str, tone: str = "blue") -> None:
    st.markdown(f"<div class='kpi-card {tone}'><div class='kpi-label'>{label}</div><div class='kpi-value'>{value}</div><div class='kpi-note'>{note}</div></div>", unsafe_allow_html=True)


def plotly_layout(figure, height: int = 360, showlegend: bool = True, coloraxis_showscale: bool | None = None) -> None:
    figure.update_layout(
        template="plotly_dark", height=height, paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        margin={"l": 12, "r": 12, "t": 18, "b": 12}, font={"family": "DM Sans", "color": "#b9c7d9"},
        showlegend=showlegend, legend={"orientation": "h", "y": -0.18},
    )
    figure.update_xaxes(gridcolor="#26364b", zerolinecolor="#26364b")
    figure.update_yaxes(gridcolor="#26364b", zerolinecolor="#26364b")
    if coloraxis_showscale is not None:
        figure.update_layout(coloraxis_showscale=coloraxis_showscale)
