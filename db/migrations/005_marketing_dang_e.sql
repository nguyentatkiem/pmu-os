-- Dạng E (16/11/2026): anh thợ lãng tử do chủ kênh đóng bằng mặt và giọng thật (thẻ @Tôi trên Google Flow).
ALTER TABLE mkt_videos DROP CONSTRAINT IF EXISTS mkt_videos_format_check;
ALTER TABLE mkt_videos ADD CONSTRAINT mkt_videos_format_check CHECK (format IN ('A','B','C','D','E'));
