## Watch Tracking, Cast to Phone, and Profile Overhaul

This PR introduces comprehensive watch progress tracking, a full phone-casting server, and major UI overhauls for profiles and playlists.

### Highlights & Features

- **Local Watch Tracking**: Deep integration with `mpv` and `iina` via IPC socket to accurately track watch progress down to the second. Automatically saves progress to the local database and resumes where you left off.
- **Cast to Phone**: Full local streaming server allowing you to cast episodes to your phone (via Wi-Fi/Hotspot). Generates an ASCII QR code in the terminal to easily open the stream.
- **Live "Now Playing" Panel**: The terminal now displays a live progress bar, timestamps, and play/pause status natively in the UI while watching locally or casting.
- **Profile Screen Overhaul**: 
  - Dynamic vertical scrolling view.
  - "Continue Watching" section with beautiful cards, progress bars, and episode subtext.
  - "Playlists" section with Spotify-style 2x2 grid covers.
- **Playlist Management**: Create playlists, add anime, and share them via base64 encoded strings (`lynn:playlist:...`). Includes a dedicated playlist viewer screen.
- **Onboarding Flow**: Interactive profile setup when first launching the app.
- **Global Instant Search**: Restored the quick search overlay globally accessible.
- **Database Layer**: Established a typed JSON store layer and repositories for Profile, Watch History, and Playlists.
- **UI Polish**: Robust layout handling to prevent terminal overflow clipping, proper flexbox usage, and extracted color themes.
