// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod dsp;
mod models;

use commands::{export_project, generate_waveform_peaks, load_audio_metadata, save_audio_metadata};

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_audio_metadata,
            save_audio_metadata,
            generate_waveform_peaks,
            export_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running Splice It desktop workspace");
}
