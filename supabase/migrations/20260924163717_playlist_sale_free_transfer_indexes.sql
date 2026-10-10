create index if not exists idx_playlist_sale_free_transfers_seller
  on public.playlist_sale_free_transfers(seller_id);

create index if not exists idx_playlist_sale_free_transfers_buyer
  on public.playlist_sale_free_transfers(buyer_id);
