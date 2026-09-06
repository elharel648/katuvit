# Katuvit Server

## שירות התמלול (Modal)
- `transcriber.py` — serverless GPU (L4), המודל אפוי בתוך ה-image (בלי הורדה ב-cold start),
  נכבה לבד אחרי 60 שניות בלי בקשות = אפס עלות קבועה.
- אותה צנרת בדיוק שאומתה ב-PoC על המק (large-v3 מלא, בלי כפיית שפה, word timestamps).

## פריסה (פעם אחת, ~10 דקות)
1. חשבון בחינם: https://modal.com (יש free tier חודשי נדיב — מספיק לכל שלב הפיתוח)
2. `pip install modal && modal setup` (התחברות)
3. `modal secret create katuvit-api-key KATUVIT_API_KEY=<מפתח-חזק-שנייצר>`
4. `modal deploy server/transcriber.py` → מקבלים URL של endpoint

## הבא בתור (שבוע 1)
- [ ] bucket ב-Cloudflare R2 להעלאות (presigned URLs, מחיקה אוטומטית אחרי 24h)
- [ ] endpoint צריבה (אותו image + ffmpeg/libass — להעביר את burn.py מה-poc)
- [ ] טבלת jobs + credits ב-Supabase

## עלות משוערת
L4 ≈ $0.000222/שנייה. סרטון דקה ≈ 8-12 שניות GPU ≈ **פחות מ-1 אגורה**.
