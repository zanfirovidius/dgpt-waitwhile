'use client';

import { useEffect, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings, PlatformSettings } from '@/app/actions/platform';
import { Save, Shield, Info, Building, User, Mail, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      const res = await getPlatformSettings();
      if (res.success && res.data) {
        setSettings(res.data);
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setMessage(null);
    
    const res = await updatePlatformSettings(settings);
    if (res.success) {
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to update settings' });
    }
    setSaving(false);
  };

  const updateField = (field: keyof PlatformSettings, value: string | number) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Settings</h1>
          <p className="text-base-content/60">Configure global defaults for the public feedback system.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary gap-2 shadow-lg shadow-primary/20"
        >
          {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} shadow-md`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Operator Information */}
        <div className="card bg-base-100 shadow-xl border border-base-200 overflow-hidden">
          <div className="bg-base-200/50 px-6 py-4 border-b border-base-200 flex items-center gap-2">
            <Building size={18} className="text-primary" />
            <h2 className="font-bold">Operator Information</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Operator Public Name</span></label>
              <input 
                type="text" 
                value={settings?.operatorName || ''} 
                onChange={(e) => updateField('operatorName', e.target.value)}
                placeholder="e.g. Din Grija Pentru Tine"
                className="input input-bordered w-full focus:input-primary transition-all"
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Legal Entity Name</span></label>
              <input 
                type="text" 
                value={settings?.operatorLegalName || ''} 
                onChange={(e) => updateField('operatorLegalName', e.target.value)}
                placeholder="e.g. Asociatia DGPT"
                className="input input-bordered w-full focus:input-primary transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label"><span className="label-text font-medium text-sm">Tax ID (CIF)</span></label>
                <input 
                  type="text" 
                  value={settings?.operatorTaxId || ''} 
                  onChange={(e) => updateField('operatorTaxId', e.target.value)}
                  className="input input-bordered w-full focus:input-primary transition-all"
                />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text font-medium text-sm">Phone Number</span></label>
                <input 
                  type="text" 
                  value={settings?.operatorPhone || ''} 
                  onChange={(e) => updateField('operatorPhone', e.target.value)}
                  className="input input-bordered w-full focus:input-primary transition-all"
                />
              </div>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Headquarters Address</span></label>
              <textarea 
                value={settings?.operatorAddress || ''} 
                onChange={(e) => updateField('operatorAddress', e.target.value)}
                className="textarea textarea-bordered h-20 focus:textarea-primary transition-all"
              />
            </div>
          </div>
        </div>

        {/* Data Protection (DPO) */}
        <div className="card bg-base-100 shadow-xl border border-base-200 overflow-hidden">
          <div className="bg-base-200/50 px-6 py-4 border-b border-base-200 flex items-center gap-2">
            <Shield size={18} className="text-secondary" />
            <h2 className="font-bold">Data Protection Officer</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">DPO Full Name</span></label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input 
                  type="text" 
                  value={settings?.dpoName || ''} 
                  onChange={(e) => updateField('dpoName', e.target.value)}
                  className="input input-bordered w-full pl-10 focus:input-primary transition-all"
                />
              </div>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">DPO Contact Email</span></label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input 
                  type="email" 
                  value={settings?.dpoEmail || ''} 
                  onChange={(e) => updateField('dpoEmail', e.target.value)}
                  className="input input-bordered w-full pl-10 focus:input-primary transition-all"
                />
              </div>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Data Retention Period (Days)</span>
              </label>
              <input 
                type="number" 
                value={settings?.defaultFeedbackRetentionDays || 365} 
                onChange={(e) => updateField('defaultFeedbackRetentionDays', parseInt(e.target.value))}
                className="input input-bordered w-full focus:input-primary transition-all"
              />
              <label className="label">
                <span className="label-text-alt text-base-content/50">Feedback older than this will be automatically archived/purged.</span>
              </label>
            </div>
          </div>
        </div>

        {/* Global Form Content Defaults */}
        <div className="card bg-base-100 shadow-xl border border-base-200 lg:col-span-2 overflow-hidden">
          <div className="bg-base-200/50 px-6 py-4 border-b border-base-200 flex items-center gap-2">
            <FileText size={18} className="text-accent" />
            <h2 className="font-bold">Feedback Form Content Defaults</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control md:col-span-2">
              <label className="label"><span className="label-text font-medium text-sm">Default Form Title</span></label>
              <input 
                type="text" 
                value={settings?.defaultFeedbackFormTitle || ''} 
                onChange={(e) => updateField('defaultFeedbackFormTitle', e.target.value)}
                className="input input-bordered w-full focus:input-primary transition-all font-semibold"
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Introductory Text</span></label>
              <textarea 
                value={settings?.defaultFeedbackIntroText || ''} 
                onChange={(e) => updateField('defaultFeedbackIntroText', e.target.value)}
                className="textarea textarea-bordered h-28 focus:textarea-primary transition-all"
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Success Message (Thank You)</span></label>
              <textarea 
                value={settings?.defaultFeedbackSuccessMessage || ''} 
                onChange={(e) => updateField('defaultFeedbackSuccessMessage', e.target.value)}
                className="textarea textarea-bordered h-28 focus:textarea-primary transition-all"
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Consent Checkbox Text</span></label>
              <textarea 
                value={settings?.defaultFeedbackConsentText || ''} 
                onChange={(e) => updateField('defaultFeedbackConsentText', e.target.value)}
                className="textarea textarea-bordered h-24 focus:textarea-primary transition-all text-sm"
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-medium text-sm">Privacy Notice Template (GDPR)</span></label>
              <textarea 
                value={settings?.defaultPrivacyNoticeTemplate || ''} 
                onChange={(e) => updateField('defaultPrivacyNoticeTemplate', e.target.value)}
                className="textarea textarea-bordered h-24 focus:textarea-primary transition-all text-xs"
              />
              <label className="label">
                <span className="label-text-alt text-base-content/50 italic">This will be shown on all public forms unless overridden.</span>
              </label>
            </div>
          </div>
        </div>
      </form>
      
      <div className="flex justify-end pt-4 pb-12">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary btn-wide gap-2 shadow-lg shadow-primary/20"
        >
          {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={18} />}
          Save Platform Settings
        </button>
      </div>
    </div>
  );
}
