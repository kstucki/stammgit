import { mount } from 'svelte';
import App from './App.svelte';
import './tokens.css';
import './fonts.css';
import './app.css';

mount(App, { target: document.getElementById('svelte-app')! });
