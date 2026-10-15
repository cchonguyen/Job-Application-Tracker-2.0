import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { AUTH_REQUIRED_EVENT, getApiKey, setApiKey } from '../lib/apiClient';

interface AccessKeyModalProps {
  onSaved: () => void;
}

/** Opens whenever the API answers 401 and stores the access key in this browser. */
export const AccessKeyModal = ({ onSaved }: AccessKeyModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const [hadKey, setHadKey] = useState(false);

  useEffect(() => {
    const open = () => {
      setHadKey(!!getApiKey());
      setIsOpen(true);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, open);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, open);
  }, []);

  if (!isOpen) return null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) return;
    setApiKey(key);
    setValue('');
    setIsOpen(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <form
        onSubmit={save}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <KeyRound className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Enter access key</h2>
        </div>
        <p className="text-sm text-slate-600">
          {hadKey
            ? 'The saved access key was not accepted. Enter the current API_ACCESS_KEY from your server settings.'
            : 'This tracker is protected. Enter the API_ACCESS_KEY from your server settings. It is saved in this browser only.'}
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Access key"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
};
