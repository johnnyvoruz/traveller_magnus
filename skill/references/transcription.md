# Getting a transcript, and the consent list

This is your work as the referee's AI agent, with the referee's tools and accounts. Traveller.voyage
does not record or transcribe, and never receives the audio or the transcript.

Facts here were read from the vendors' pages on 2026-10-17; the URLs are in
`directives/reports/x_session_ingest.md` §2 and §3. Prices change; check the page before telling the
referee a number.

## Consent first

Ask whether everyone agreed to be recorded. Where the referee or any player sits in one of these
places, everyone's agreement is required by law, not just courtesy:

- United States: California, Delaware, Florida, Illinois, Maryland, Massachusetts, Michigan (contested),
  Montana, Nevada, New Hampshire, Pennsylvania, Washington for any conversation; Oregon and Missouri for
  in-person conversations; Connecticut and Nevada for calls. Elsewhere in the US and under federal law
  one participant's consent is enough.
- Germany: recording another person's non-public speech without their authorisation is a criminal
  offence (§ 201 StGB), and so is passing the recording on.
- Australia: New South Wales needs every principal party's consent; Victoria lets a participant record
  but publishing needs everyone's agreement; Queensland lets a participant record.
- United Kingdom, European Union, Canada: a participant may record a private conversation for personal
  use. Uploading it to a cloud service is a step further; say which service you will use.

When in doubt, the table's agreement at the start of the recording ("we are recording tonight, is
that fine with everyone?") is the right practice everywhere.

## The term list

Before transcribing, build a vocabulary list from the campaign index: every record name, every
sector and world name in an anchor, the player characters, and the words of the game the service will
otherwise mangle (Jumpdrive, Jump-2, Regina, UWP, Imperium, Vargr, Aslan, Zhodani, credits, Cr). Give
it to the transcriber as its key-term, keyword or prompt input. Keep it under 100 terms for Deepgram
and under 1,000 for AssemblyAI and ElevenLabs.

## Recipes

Pick the first that fits what the referee has.

### A local tool (free, nothing leaves the machine)
- **WhisperX** (speaker labels): `whisperx <file> --model large-v3 --diarize --hf_token <token> --output_format srt`;
  the diarization model needs a Hugging Face token and accepting the pyannote model terms.
- **whisper.cpp**: `whisper-cli -m ggml-large-v3-turbo.bin -f <file.wav> -osrt --prompt "<term list>"`;
  convert first with `ffmpeg -i <in> -ar 16000 -ac 1 <file.wav>`. Speaker labels are experimental
  (`-tdrz` with a tinydiarize model).
- **MacWhisper** (Mac): open the file, turn on speaker recognition, export SRT or text with timestamps.
- **Apple Voice Memos** (Mac with Apple silicon on macOS Sequoia, and recent iPhones): the transcript
  is in the app; copy it out. No speaker labels.
- **Google Recorder** (Pixel 6 and later): the transcript with speaker labels is on the phone (US
  English); share it as text.

### The referee's own speech-to-text key (about a dollar for four hours)
- **Deepgram Nova-3**: `POST https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&smart_format=true&paragraphs=true&keyterm=<term>&keyterm=<term>…`
  with the audio as the body; files up to 2 GB.
- **AssemblyAI**: upload, then `POST /v2/transcript` with `speaker_labels: true` and
  `keyterms_prompt: [...]`; files up to 5 GB and 10 hours.
- **OpenAI**: `gpt-4o-transcribe-diarize` with `response_format: diarized_json` and
  `chunking_strategy: "auto"`; files must be under 25 MB, so split a four-hour recording into pieces
  (for example `ffmpeg -i <in> -f segment -segment_time 1200 -c copy part%03d.m4a`) and keep the offset
  of each piece for the timestamps.
- **Amazon Transcribe**, **Azure Speech batch**, **Google Speech-to-Text v2 batch**, **ElevenLabs
  Scribe**: all take a four-hour file with speaker labels; Azure's batch diarization stops at exactly
  240 minutes per file.
- **A Gemini model** takes audio directly (up to 9.5 hours in one prompt; files over 20 MB go through
  the Files API). Ask it for a timestamped transcript with speaker labels, then proceed. Note the
  unpaid tier may use uploads to improve Google's products; the paid tier does not.

What the vendors do with the audio: OpenAI and Anthropic APIs do not train on it by default; Gemini's
unpaid tier does; Deepgram and AssemblyAI have opt-outs (AssemblyAI's for paid plans only). Tell the
referee which you used.

### Output you need
Timestamps (or line numbers) and speaker labels where the tool gives them. Keep the transcript on
the referee's machine. Do not upload it to traveller.voyage; the batch carries only short quotes.
