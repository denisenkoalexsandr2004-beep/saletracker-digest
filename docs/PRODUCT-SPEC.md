# SaleTracker Digest — first vertical release

## Brand architecture

- Product and Telegram sender: **Дайджест Платформы Сейл Трекер**.
- SaleTracker owns subscription, personalization, editorial workflow and
  delivery.
- ЦЗС is the core commercial route: events, negotiations and attributed leads.

## Product job

Give suppliers and buyers a calm, useful stream of retail signals and turn
relevant interest into measurable participation in CZS events.

## Audiences

- **Supplier:** follows categories and needs a path to negotiations with retail.
- **Buyer:** follows supply signals and needs relevant producers.
- **Both:** receives a combined market view and a neutral partner CTA.
- **Editor:** approves a note once; the system personalizes issues
  automatically.

## Editorial rules

- Only approved notes may enter an issue.
- The selection target is 80% subscriber tags and 20% general retail news.
- Positive or curious verified industry news may replace one general item.
- Missing relevant news never gets replaced with invented filler.
- Each Telegram item has two concise paragraphs, a highlighted metrics block
  and a direct link to the original source article.
- The event CTA appears only after the final item.

## MVP schedules

| Frequency | Schedule | Target |
| --- | --- | ---: |
| Daily | Every day, 12:00 MSK | 5 / 10 / 15 |
| Twice weekly | Monday and Thursday, 12:00 MSK | 5 / 10 / 15 |
| Weekly | Monday, 12:00 MSK | 5 / 10 / 15 |
| Monthly | First Monday, 12:00 MSK | 5 / 10 / 15 |

Approved-note cutoff is 11:30 MSK on the delivery day.

## First-release acceptance

- A visitor can submit valid digest preferences.
- The pilot is free and does not ask the visitor to choose a tariff.
- The API rejects invalid input.
- A personalized preview contains approved notes only.
- The preview respects the 80/20 target when enough notes exist.
- No filler is added when there are not enough suitable notes.
- The final CTA matches the user role and tags.
- The demo admin shows materials, an upcoming issue, events and attributed
  leads.
