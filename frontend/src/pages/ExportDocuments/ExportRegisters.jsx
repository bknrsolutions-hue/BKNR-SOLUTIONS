import '../Attendance/Attendance.css';
import './ExportWorkspace.css';
import { RegisterLibrary } from '../Registers/ModuleRegisters';

export default function ExportRegisters({ user }) {
  return (
    <div className="attendance-container export-registers-page">
      <div className="attendance-page-header">
        <div>
          <h1>Export Registers</h1>
          <p>Download controlled Excel registers without opening each document screen.</p>
        </div>
      </div>
      <RegisterLibrary modules={['exports']} user={user} />
    </div>
  );
}
