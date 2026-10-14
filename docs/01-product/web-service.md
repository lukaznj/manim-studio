# Web service (idea, not planned yet)

Revisit once quick mode and series mode work well in the app ([[roadmap]]).

## The idea

A website where anyone gets a finished video without installing anything:

- **Quick mode:** describe the video, attach PDFs, get an mp4 with subtitles.
- **Series mode:** upload a course's lectures, approve the proposed episodes, get the whole series.

The desktop app stays free and open source. The service sells convenience: no setup, no API keys, no computer kept busy.

## Costs per video

Every video costs real money, so it can't be free beyond a trial:

- **Claude:** the scripting and the scene-writing turns. Through the Claude API with the service's own key: a consumer Claude plan can't be used to serve other people. The model and effort comparison on the [[roadmap]] gives the cost per video.
- **ElevenLabs:** per character of narration, on a plan whose licence allows commercial use. Other languages multiply it.
- **Rendering:** CPU time on the render workers (the same Docker image as the remote render worker). No GPU needed.
- **Storage and bandwidth** for uploads and finished videos.

## Pricing to explore

- One or two free videos per new account, so people see how useful it is.
- Then paid per video, or credits, priced from the measured cost per minute of video plus a margin. A series could be priced per episode with a discount.
- Limits on the free videos (length, resolution, a watermark) keep the trial cheap.

## Questions before building it

- **Abuse of the free trial:** accounts are cheap to make. It may need a verified e-mail, a phone number or a card on file.
- **Rights to the material:** users upload lecture PDFs they may not own. The terms must make them responsible, and the service mustn't publish anything on its own.
- **Privacy:** uploaded PDFs and videos are deleted after a set time unless the user keeps them.
- **Failures:** a video that fails the checks (render errors, layout warnings) must be retried or refunded automatically, never charged.
- **Who runs it:** payments, VAT for EU customers, support and uptime are a business, not a feature. Decide that before writing code.
