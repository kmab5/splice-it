// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod dsp;
mod encoders;
mod models;

use std::sync::Mutex;

use commands::{
    analyze_audio_file, export_concat, export_project, generate_waveform_peaks, load_audio_metadata,
    probe_audio_file, read_audio_file_bytes, read_text_file, save_audio_metadata,
    take_launch_file, write_text_file,
};

/// A project file passed on the command line, e.g. by double-clicking a .sic
/// file that Windows has associated with the app. Consumed once at startup.
pub struct LaunchFile(pub Mutex<Option<String>>);

fn main() {
    env_logger::init();

    // The bundle declares a .sic / .audioproj file association, so the shell
    // hands us the path as an argument. Nothing was reading it before.
    let launch_file = std::env::args().skip(1).find(|arg| {
        let lower = arg.to_lowercase();
        lower.ends_with(".sic") || lower.ends_with(".audioproj")
    });

    tauri::Builder::default()
        .manage(LaunchFile(Mutex::new(launch_file)))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_audio_metadata,
            save_audio_metadata,
            analyze_audio_file,
            probe_audio_file,
            take_launch_file,
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
