"""
Health check endpoint
Access via: /api/health
"""
import streamlit as st

st.set_page_config(layout="wide", initial_sidebar_state="collapsed")
hide_streamlit_style = """
<style>
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
.stDecorator {visibility: hidden;}
</style>
"""
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

st.json({"status": "ok", "timestamp": str(__import__('datetime').datetime.now())})
