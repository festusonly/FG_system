import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function EmployeeManagementSection({ user }) {
  const { employees, deductions, registerEmployee, removeEmployee, updateEmployeeSalary, recordDeduction, payEmployeeSalary, payAllSalaries, deleteDeduction, t } = useApp();
  
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empSalary, setEmpSalary] = useState('');
  const [empIdImage, setEmpIdImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const [showDeductModal, setShowDeductModal] = useState(false);
  const [deductEmpId, setDeductEmpId] = useState('');
  const [deductType, setDeductType] = useState('loan');
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');

  const [viewingIdUrl, setViewingIdUrl] = useState(null);
  const [editingSalaryId, setEditingSalaryId] = useState(null);
  const [editSalaryValue, setEditSalaryValue] = useState('');
  const [viewingDeductionsEmp, setViewingDeductionsEmp] = useState(null);
  const [activeActionMenuEmp, setActiveActionMenuEmp] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError('');
    
    const result = await registerEmployee(
      { name: empName, phone: empPhone, baseSalary: empSalary },
      empIdImage
    );
    
    setSubmitting(false);
    if (!result.success) {
      setActionError(result.error || 'Failed to register employee');
    } else {
      setEmpName(''); setEmpPhone(''); setEmpSalary(''); setEmpIdImage(null);
      setShowRegisterModal(false);
    }
  };

  const handleDeductSubmit = async (e) => {
    e.preventDefault();
    if (!deductEmpId) return;
    setSubmitting(true);
    setActionError('');

    const finalReason = deductType === 'loan' ? 'Loan / Salary Advance' : deductReason;
    const result = await recordDeduction(deductEmpId, deductType, deductAmount, finalReason);
    
    setSubmitting(false);
    if (!result.success) {
      setActionError(result.error || 'Failed to record deduction');
    } else {
      setDeductEmpId(''); setDeductType('loan'); setDeductAmount(''); setDeductReason('');
      setShowDeductModal(false);
    }
  };

  const handlePayEmployee = async (employeeId, employeeName) => {
    if (window.confirm(`Settle all deductions for ${employeeName} and pay salary?`)) {
      const result = await payEmployeeSalary(employeeId);
      if (!result.success) {
        setActionError(result.error || 'Failed to settle salary');
      }
    }
  };

  const handlePayAll = async () => {
    if (window.confirm("Settle ALL deductions for ALL employees and mark salaries as paid?")) {
      const result = await payAllSalaries();
      if (!result.success) {
        setActionError(result.error || 'Failed to settle all salaries');
      }
    }
  };

  const saveSalary = async (employeeId) => {
    if (!editSalaryValue) return;
    const result = await updateEmployeeSalary(employeeId, editSalaryValue);
    if (!result.success) {
      setActionError(result.error || 'Failed to update salary');
    } else {
      setEditingSalaryId(null);
    }
  };

  const handleRemove = async (employeeId, employeeName) => {
    if (window.confirm(`Are you absolutely sure you want to completely remove ${employeeName} from the system? All their records will be deleted.`)) {
      const result = await removeEmployee(employeeId);
      if (!result.success) {
        setActionError(result.error || 'Failed to remove employee');
      }
    }
  };

  return (
    <div className="employee-management-section">
      {/* Top Header & Stats */}
      <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div className="history-pill" style={{fontWeight: 'bold'}}>
            {employees.length} {t('registered')}
          </div>
        </div>
        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
          <button 
            className="btn-action" 
            style={{background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}
            onClick={handlePayAll}
          >
            ✓ {t('pay_all_salaries')}
          </button>
          <button 
            className="btn-action" 
            style={{background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}
            onClick={() => setShowDeductModal(true)}
          >
            + {t('record_deduction')}
          </button>
          <button 
            className="btn-action" 
            style={{background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}
            onClick={() => setShowRegisterModal(true)}
          >
            + {t('register_employee')}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="action-error-banner" style={{background: '#fef2f2', color: '#991b1b', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between'}}>
          {actionError}
          <button onClick={() => setActionError('')} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 'bold'}}>X</button>
        </div>
      )}

      <div style={{marginBottom: '1rem', position: 'relative'}}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input 
          type="text" 
          placeholder={t('search_employee')} 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="modern-search-input"
        />
      </div>

      <div className="panel-section" style={{padding: '1rem', paddingBottom: '250px', minHeight: '400px'}}>
        <div className="table-responsive">
          <table className="data-table" style={{width: '100%', minWidth: '800px'}}>
            <thead>
            <tr>
              <th>{t('employee')}</th>
              <th>{t('phone_number')}</th>
              <th>{t('base_salary')}</th>
              <th>{t('report_deduction')}</th>
              <th>{t('net_pay_amount') || 'Net Pay'}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map(emp => {
                // Calculate pending deductions
                const empDeductions = deductions.filter(d => d.employee_id === emp.id && d.status === 'pending');
                const totalDeducted = empDeductions.reduce((sum, d) => sum + Number(d.amount_rwf), 0);
                const netPay = Number(emp.base_salary) - totalDeducted;

                return (
                  <React.Fragment key={emp.id}>
                    <tr>
                      <td className="history-day-title" style={{fontWeight: 'bold'}}>
                        {emp.name}
                      </td>
                      <td>{emp.phone}</td>
                      <td>
                        {editingSalaryId === emp.id ? (
                          <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
                            <input 
                              type="number" 
                              value={editSalaryValue} 
                              onChange={e => setEditSalaryValue(e.target.value)}
                              style={{width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1'}}
                            />
                            <button onClick={() => saveSalary(emp.id)} style={{background: '#0d9488', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'}}>Save</button>
                            <button onClick={() => setEditingSalaryId(null)} style={{background: '#cbd5e1', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'}}>X</button>
                          </div>
                        ) : (
                          <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                            <span>RWF {Number(emp.base_salary).toLocaleString()}</span>
                            <button 
                              onClick={() => { setEditingSalaryId(emp.id); setEditSalaryValue(emp.base_salary); }}
                              style={{background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', textDecoration: 'underline', fontSize: '0.8rem'}}
                            >
                              {t('edit')}
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{color: totalDeducted > 0 ? '#ef4444' : '#64748b', fontWeight: totalDeducted > 0 ? 'bold' : 'normal'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <span>RWF {totalDeducted.toLocaleString()}</span>
                          {empDeductions.length > 0 && (
                            <button 
                              onClick={() => setViewingDeductionsEmp(emp)}
                              style={{background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold'}}
                            >
                              {t('view_details')}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{color: '#0d9488', fontWeight: 'bold', fontSize: '1.1rem'}}>
                        RWF {netPay.toLocaleString()}
                      </td>
                      <td style={{position: 'relative'}}>
                        <button 
                          onClick={() => setActiveActionMenuEmp(emp)}
                          className="btn-details-card"
                          style={{padding: '4px 12px', fontSize: '1.2rem', fontWeight: 'bold'}}
                        >
                          ⋮
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">{t('no_employees_found') || 'No employees registered yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modals */}
      {showRegisterModal && (
        <div className="modal-overlay">
          <form className="modal-form" onSubmit={handleRegisterSubmit}>
            <h3>{t('register_employee')}</h3>
            <div className="form-group">
              <label>{t('full_name')}</label>
              <input type="text" value={empName} onChange={e => setEmpName(e.target.value)} required />
            </div>

            <div className="form-group">
              <label>{t('phone_number')}</label>
              <input type="text" value={empPhone} onChange={e => setEmpPhone(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('base_salary')}</label>
              <input type="number" value={empSalary} onChange={e => setEmpSalary(e.target.value)} required min="0" />
            </div>
            <div className="form-group">
              <label>ID Card Screenshot (Optional but recommended)</label>
              <input type="file" accept="image/*" onChange={e => setEmpIdImage(e.target.files[0])} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? t('loading') : t('register_employee')}
              </button>
              <button type="button" className="btn-cancel" onClick={() => setShowRegisterModal(false)}>{t('cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {showDeductModal && (
        <div className="modal-overlay">
          <form className="modal-form" onSubmit={handleDeductSubmit}>
            <h3>{t('record_deduction')}</h3>
            <div className="form-group">
              <label>{t('employee')}</label>
              <select value={deductEmpId} onChange={e => setDeductEmpId(e.target.value)} required style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1'}}>
                <option value="">-- {t('select_employee') || 'Select Employee'} --</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t('type')}</label>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="button" onClick={() => setDeductType('loan')} style={{flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: deductType === 'loan' ? '#fef3c7' : 'white', color: deductType === 'loan' ? '#d97706' : '#64748b', fontWeight: deductType === 'loan' ? 'bold' : 'normal'}}>{t('loan')}</button>
                <button type="button" onClick={() => setDeductType('fine')} style={{flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: deductType === 'fine' ? '#fef2f2' : 'white', color: deductType === 'fine' ? '#ef4444' : '#64748b', fontWeight: deductType === 'fine' ? 'bold' : 'normal'}}>{t('fine')}</button>
              </div>
            </div>
            <div className="form-group">
              <label>{t('amount_paid')} (RWF)</label>
              <input type="number" value={deductAmount} onChange={e => setDeductAmount(e.target.value)} required min="1" />
            </div>
            {deductType === 'fine' && (
              <div className="form-group">
                <label>{t('reason_details')}</label>
                <textarea 
                  value={deductReason} 
                  onChange={e => setDeductReason(e.target.value)} 
                  required 
                  rows="3" 
                  style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical'}}
                  placeholder="Explain the reason for this fine..."
                ></textarea>
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? t('loading') : t('save_deduction')}
              </button>
              <button type="button" className="btn-cancel" onClick={() => setShowDeductModal(false)}>{t('cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* ID Viewer Modal */}
      {viewingIdUrl && (
        <div className="modal-overlay" onClick={() => setViewingIdUrl(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', width: '90%'}}>
            <div className="modal-header">
              <h2>Employee ID Card</h2>
              <button className="modal-close" onClick={() => setViewingIdUrl(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{textAlign: 'center', padding: '1rem'}}>
              <img 
                src={viewingIdUrl} 
                alt="Employee ID Full Size" 
                style={{maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain', border: '1px solid #e2e8f0'}} 
              />
            </div>
            <div className="modal-footer" style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem'}}>
              <a 
                href={viewingIdUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                download
                style={{textDecoration: 'none', padding: '10px 20px', background: '#0d9488', color: 'white', borderRadius: '8px', fontWeight: 'bold'}}
              >
                Download / Open Full Size
              </a>
              <button className="btn-cancel" onClick={() => setViewingIdUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Deductions Modal */}
      {viewingDeductionsEmp && (
        <div className="modal-overlay" onClick={() => setViewingDeductionsEmp(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2>Active Reductions: {viewingDeductionsEmp.name}</h2>
              <button className="modal-close" onClick={() => setViewingDeductionsEmp(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                {deductions.filter(d => d.employee_id === viewingDeductionsEmp.id && d.status === 'pending').map(d => (
                  <div key={d.id} className="history-pill-secondary" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', width: '100%'}}>
                    <div>
                      <span style={{fontWeight: 'bold', display: 'inline-block', marginRight: '10px', color: d.type === 'fine' ? '#ef4444' : '#f59e0b'}}>{d.type.toUpperCase()}</span>
                      <span style={{color: '#1e293b', fontWeight: '500'}}>{d.reason}</span>
                      <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px'}}>Recorded by {d.recorded_by?.name || 'Unknown'}</div>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                      <strong style={{color: '#ef4444', fontSize: '1.1rem'}}>RWF {Number(d.amount_rwf).toLocaleString()}</strong>
                      <button 
                        onClick={() => { if(window.confirm('Permanently delete this deduction record?')) deleteDeduction(d.id); }}
                        style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.1rem'}}
                        title="Delete record"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setViewingDeductionsEmp(null)} style={{width: '100%'}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 3-Dots Action Modal */}
      {activeActionMenuEmp && (
        <div className="modal-overlay" onClick={() => setActiveActionMenuEmp(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '400px', padding: '0'}}>
            <div className="modal-header">
              <h2 style={{margin: 0, fontSize: '1.2rem'}} className="history-day-title">Actions: {activeActionMenuEmp.name}</h2>
              <button className="modal-close" onClick={() => setActiveActionMenuEmp(null)}>&times;</button>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px'}}>
              <button 
                onClick={() => { handlePayEmployee(activeActionMenuEmp.id, activeActionMenuEmp.name); setActiveActionMenuEmp(null); }}
                style={{width: '100%', textAlign: 'left', padding: '16px', border: '1px solid #a7f3d0', background: '#ecfdf5', borderRadius: '8px', cursor: 'pointer', color: '#047857', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                {t('pay_salary')}
              </button>
              <button 
                onClick={() => { setDeductEmpId(activeActionMenuEmp.id); setShowDeductModal(true); setActiveActionMenuEmp(null); }}
                style={{width: '100%', textAlign: 'left', padding: '16px', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: '8px', cursor: 'pointer', fontSize: '1.05rem', color: '#b45309', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                {t('record_deduction')}
              </button>
              {activeActionMenuEmp.id_screenshot_url && (
                <button 
                  onClick={() => { setViewingIdUrl(activeActionMenuEmp.id_screenshot_url); setActiveActionMenuEmp(null); }}
                  style={{width: '100%', textAlign: 'left', padding: '16px', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '8px', cursor: 'pointer', fontSize: '1.05rem', color: '#1d4ed8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'}}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {t('view_id_card')}
                </button>
              )}
              <button 
                onClick={() => { handleRemove(activeActionMenuEmp.id, activeActionMenuEmp.name); setActiveActionMenuEmp(null); }}
                style={{width: '100%', textAlign: 'left', padding: '16px', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px', cursor: 'pointer', color: '#b91c1c', fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                {t('delete_employee')}
              </button>
            </div>
            <div className="modal-footer" style={{padding: '1rem'}}>
              <button className="btn-cancel" onClick={() => setActiveActionMenuEmp(null)} style={{width: '100%'}}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
