import React from 'react';
import AccountEmailPanel from './AccountEmailPanel';
import SupportTicketPanel from './SupportTicketPanel';

export default function SupportCenterPanel({ profileId, username, enabled }: { profileId: string; username: string; enabled: boolean }) {
  return <>
    <AccountEmailPanel enabled={enabled} username={username} />
    <SupportTicketPanel profileId={profileId} username={username} enabled={enabled} />
  </>;
}
