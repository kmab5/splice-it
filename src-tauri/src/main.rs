// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod dsp;
mod models;

use commands::{
    analyze_audio_file, export_concat, export_project, generate_waveform_peaks, load_audio_metadata,
    read_audio_file_bytes, read_text_file, save_audio_metadata, write_text_file,
};

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_audio_metadata,
            save_audio_metadata,
            analyze_audio_file,
            generate_waveform_peaks,
            read_audio_file_bytes,
            read_text_file,
            write_text_file,
            export_project,
            export_concat
        ])
        .run(tauri::generate_context!())
        .expect("error while running Splice It desktop workspace");
}
