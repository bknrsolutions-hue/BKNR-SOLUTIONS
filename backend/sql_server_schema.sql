-- =========================================================================
-- ENTERPRISE ACCOUNTING & FINANCE MODULE SCHEMA (MICROSOFT SQL SERVER)
-- =========================================================================

-- 1. Branch Master
CREATE TABLE BranchMaster (
    BranchID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    BranchCode VARCHAR(20) NOT NULL,
    BranchName VARCHAR(100) NOT NULL,
    Address NVARCHAR(255),
    IsActive BIT DEFAULT 1,
    CreatedDate DATETIME DEFAULT GETDATE(),
    CONSTRAINT UC_Branch_Code UNIQUE (CompanyID, BranchCode)
);
CREATE INDEX IX_BranchMaster_Company ON BranchMaster(CompanyID);

-- 2. Financial Year Master
CREATE TABLE FinancialYearMaster (
    YearID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    YearName VARCHAR(50) NOT NULL, -- e.g., FY-2026-27
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    IsLocked BIT DEFAULT 0,
    CreatedDate DATETIME DEFAULT GETDATE()
);
CREATE INDEX IX_FinancialYear_Company ON FinancialYearMaster(CompanyID);

-- 3. Currency Master & Exchange Rates
CREATE TABLE CurrencyMaster (
    CurrencyID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    CurrencyCode VARCHAR(10) NOT NULL, -- e.g., USD, EUR, INR
    CurrencySymbol NVARCHAR(10),
    IsBaseCurrency BIT DEFAULT 0,
    CreatedDate DATETIME DEFAULT GETDATE(),
    CONSTRAINT UC_Currency_Code UNIQUE (CompanyID, CurrencyCode)
);

CREATE TABLE ExchangeRate (
    RateID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    CurrencyID INT NOT NULL,
    RateDate DATE NOT NULL,
    ExchangeRate DECIMAL(18,4) NOT NULL, -- Rate against Base Currency (e.g. 1 USD = 83.50 INR)
    CreatedDate DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (CurrencyID) REFERENCES CurrencyMaster(CurrencyID),
    CONSTRAINT UC_ExchangeRate_Date UNIQUE (CompanyID, CurrencyID, RateDate)
);

-- 4. Account Group (Tree Hierarchy)
CREATE TABLE AccountGroup (
    GroupID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    GroupName VARCHAR(100) NOT NULL,
    ParentGroupID INT NULL,
    GroupType VARCHAR(20) NOT NULL CHECK (GroupType IN ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY')),
    CreatedDate DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (ParentGroupID) REFERENCES AccountGroup(GroupID),
    CONSTRAINT UC_AccountGroup_Name UNIQUE (CompanyID, GroupName)
);
CREATE INDEX IX_AccountGroup_Parent ON AccountGroup(ParentGroupID);

-- 5. Ledger Master
CREATE TABLE LedgerMaster (
    LedgerID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    LedgerCode VARCHAR(50) NULL,
    LedgerName VARCHAR(150) NOT NULL,
    GroupID INT NOT NULL,
    OpeningBalance DECIMAL(18,2) DEFAULT 0.00,
    OpeningBalanceType VARCHAR(2) NOT NULL CHECK (OpeningBalanceType IN ('DR', 'CR')),
    GSTIN VARCHAR(15) NULL,
    PAN VARCHAR(10) NULL,
    Address NVARCHAR(255) NULL,
    Phone VARCHAR(20) NULL,
    Email VARCHAR(100) NULL,
    CreditDays INT DEFAULT 30,
    CreditLimit DECIMAL(18,2) DEFAULT 0.00,
    BranchID INT NULL,
    Status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (Status IN ('ACTIVE', 'INACTIVE')),
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME DEFAULT GETDATE(),
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    FOREIGN KEY (GroupID) REFERENCES AccountGroup(GroupID),
    FOREIGN KEY (BranchID) REFERENCES BranchMaster(BranchID),
    CONSTRAINT UC_LedgerMaster_Name UNIQUE (CompanyID, LedgerName)
);
CREATE INDEX IX_LedgerMaster_Group ON LedgerMaster(GroupID);
CREATE INDEX IX_LedgerMaster_Company ON LedgerMaster(CompanyID);

-- 6. Cost Centers
CREATE TABLE CostCenter (
    CostCenterID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    CostCenterCode VARCHAR(20) NOT NULL,
    CostCenterName VARCHAR(100) NOT NULL, -- Production, Processing, Packing, Cold Storage, Export, Administration
    IsActive BIT DEFAULT 1,
    CreatedDate DATETIME DEFAULT GETDATE(),
    CONSTRAINT UC_CostCenter_Code UNIQUE (CompanyID, CostCenterCode)
);

-- 7. Budget Master
CREATE TABLE BudgetMaster (
    BudgetID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    LedgerID INT NOT NULL,
    YearID INT NOT NULL,
    BudgetAmount DECIMAL(18,2) NOT NULL,
    CreatedDate DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (LedgerID) REFERENCES LedgerMaster(LedgerID),
    FOREIGN KEY (YearID) REFERENCES FinancialYearMaster(YearID),
    CONSTRAINT UC_Budget_Ledger_Year UNIQUE (CompanyID, LedgerID, YearID)
);

-- 8. Voucher Types
CREATE TABLE VoucherType (
    VoucherTypeID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    TypeName VARCHAR(50) NOT NULL, -- Payment, Receipt, Journal, Contra, Purchase, Sales, Credit Note, Debit Note, Stock Journal, Adjustment Journal, Opening Journal
    Prefix VARCHAR(10) NOT NULL,   -- e.g., PAY, RCT, JV, PUR, SAL
    IsAutoNumber BIT DEFAULT 1,
    NextNumber INT DEFAULT 1,
    CreatedDate DATETIME DEFAULT GETDATE(),
    CONSTRAINT UC_VoucherType_Name UNIQUE (CompanyID, TypeName)
);

-- 9. Voucher Header
CREATE TABLE VoucherHeader (
    VoucherID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    VoucherNo VARCHAR(50) NOT NULL,
    VoucherDate DATE NOT NULL,
    VoucherTypeID INT NOT NULL,
    BranchID INT NULL,
    ReferenceNo VARCHAR(50) NULL,
    Narration NVARCHAR(500) NULL,
    Status VARCHAR(20) DEFAULT 'DRAFT' CHECK (Status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED')),
    ApprovedBy VARCHAR(100) NULL,
    ApprovedDate DATETIME NULL,
    CreatedBy VARCHAR(100) NOT NULL,
    CreatedDate DATETIME DEFAULT GETDATE(),
    ModifiedBy VARCHAR(100) NULL,
    ModifiedDate DATETIME NULL,
    FOREIGN KEY (VoucherTypeID) REFERENCES VoucherType(VoucherTypeID),
    FOREIGN KEY (BranchID) REFERENCES BranchMaster(BranchID),
    CONSTRAINT UC_VoucherHeader_No UNIQUE (CompanyID, VoucherNo)
);
CREATE INDEX IX_VoucherHeader_Date ON VoucherHeader(VoucherDate);
CREATE INDEX IX_VoucherHeader_Type ON VoucherHeader(VoucherTypeID);

-- 10. Voucher Details
CREATE TABLE VoucherDetail (
    DetailID INT IDENTITY(1,1) PRIMARY KEY,
    VoucherID INT NOT NULL,
    LedgerID INT NOT NULL,
    CostCenterID INT NULL,
    DebitAmount DECIMAL(18,2) DEFAULT 0.00,
    CreditAmount DECIMAL(18,2) DEFAULT 0.00,
    Remarks NVARCHAR(255) NULL,
    FOREIGN KEY (VoucherID) REFERENCES VoucherHeader(VoucherID) ON DELETE CASCADE,
    FOREIGN KEY (LedgerID) REFERENCES LedgerMaster(LedgerID),
    FOREIGN KEY (CostCenterID) REFERENCES CostCenter(CostCenterID)
);
CREATE INDEX IX_VoucherDetail_Voucher ON VoucherDetail(VoucherID);
CREATE INDEX IX_VoucherDetail_Ledger ON VoucherDetail(LedgerID);

-- 11. Bank Reconciliation
CREATE TABLE BankReconciliation (
    ReconcileID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    BankLedgerID INT NOT NULL,
    StatementDate DATE NOT NULL,
    ReferenceNo VARCHAR(50) NULL,
    Debit DECIMAL(18,2) DEFAULT 0.00,
    Credit DECIMAL(18,2) DEFAULT 0.00,
    IsMatched BIT DEFAULT 0,
    MatchedDate DATE NULL,
    VoucherDetailID INT NULL,
    Remarks NVARCHAR(255),
    FOREIGN KEY (BankLedgerID) REFERENCES LedgerMaster(LedgerID),
    FOREIGN KEY (VoucherDetailID) REFERENCES VoucherDetail(DetailID)
);

-- 12. Audit Trail
CREATE TABLE AuditTrail (
    AuditID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID VARCHAR(50) NOT NULL,
    TableName VARCHAR(100) NOT NULL,
    RecordID INT NOT NULL,
    Action VARCHAR(10) NOT NULL CHECK (Action IN ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT')),
    OldValue NVARCHAR(MAX) NULL,
    NewValue NVARCHAR(MAX) NULL,
    UserEmail VARCHAR(100) NOT NULL,
    Timestamp DATETIME DEFAULT GETDATE()
);
CREATE INDEX IX_AuditTrail_Record ON AuditTrail(TableName, RecordID);

-- =========================================================================
-- VIEWS
-- =========================================================================

-- View: Voucher Summaries (Dr/Cr totals per voucher)
GO
CREATE VIEW v_VoucherSummary AS
SELECT 
    h.VoucherID,
    h.CompanyID,
    h.VoucherNo,
    h.VoucherDate,
    t.TypeName AS VoucherType,
    h.Status,
    h.Narration,
    SUM(d.DebitAmount) AS TotalDebit,
    SUM(d.CreditAmount) AS TotalCredit
FROM VoucherHeader h
JOIN VoucherType t ON h.VoucherTypeID = t.VoucherTypeID
LEFT JOIN VoucherDetail d ON h.VoucherID = d.VoucherID
GROUP BY h.VoucherID, h.CompanyID, h.VoucherNo, h.VoucherDate, t.TypeName, h.Status, h.Narration;
GO

-- =========================================================================
-- STORED PROCEDURES
-- =========================================================================

-- Stored Procedure: Recursive Rollup of Trial Balance
GO
CREATE PROCEDURE sp_TrialBalance
    @CompanyID VARCHAR(50),
    @AsOfDate DATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Recursive CTE to fetch Group hierarchies
    WITH GroupHierarchy AS (
        -- Anchor member
        SELECT 
            GroupID, 
            ParentGroupID, 
            GroupName,
            CAST(GroupName AS VARCHAR(MAX)) AS GroupPath,
            GroupID AS RootGroupID,
            GroupType
        FROM AccountGroup
        WHERE CompanyID = @CompanyID AND ParentGroupID IS NULL
        
        UNION ALL
        
        -- Recursive member
        SELECT 
            g.GroupID, 
            g.ParentGroupID, 
            g.GroupName,
            h.GroupPath + ' > ' + g.GroupName,
            h.RootGroupID,
            g.GroupType
        FROM AccountGroup g
        INNER JOIN GroupHierarchy h ON g.ParentGroupID = h.GroupID
        WHERE g.CompanyID = @CompanyID
    ),
    LedgerBalances AS (
        -- Calculate each ledger's balance up to @AsOfDate
        SELECT 
            l.LedgerID,
            l.GroupID,
            l.LedgerName,
            l.OpeningBalance,
            l.OpeningBalanceType,
            -- Actual postings
            COALESCE(SUM(vd.DebitAmount), 0) AS PeriodDebit,
            COALESCE(SUM(vd.CreditAmount), 0) AS PeriodCredit
        FROM LedgerMaster l
        LEFT JOIN VoucherDetail vd ON l.LedgerID = vd.LedgerID
        LEFT JOIN VoucherHeader vh ON vd.VoucherID = vh.VoucherID AND vh.Status = 'POSTED' AND vh.VoucherDate <= @AsOfDate
        WHERE l.CompanyID = @CompanyID
        GROUP BY l.LedgerID, l.GroupID, l.LedgerName, l.OpeningBalance, l.OpeningBalanceType
    ),
    CalculatedLedgerBalances AS (
        -- Compute net balance per ledger
        SELECT 
            LedgerID,
            GroupID,
            LedgerName,
            CASE 
                -- Net Balance calculation
                WHEN OpeningBalanceType = 'DR' THEN (OpeningBalance + PeriodDebit - PeriodCredit)
                ELSE - (OpeningBalance + PeriodCredit - PeriodDebit)
            END AS NetDebitBalance
        FROM LedgerBalances
    )
    -- Rollup balances along the hierarchy tree
    SELECT 
        gh.GroupPath,
        gh.GroupName,
        gh.GroupType,
        clb.LedgerName,
        CASE WHEN clb.NetDebitBalance >= 0 THEN clb.NetDebitBalance ELSE 0 END AS Debit,
        CASE WHEN clb.NetDebitBalance < 0 THEN ABS(clb.NetDebitBalance) ELSE 0 END AS Credit
    FROM GroupHierarchy gh
    JOIN CalculatedLedgerBalances clb ON gh.GroupID = clb.GroupID
    ORDER BY gh.GroupPath, clb.LedgerName;
END;
GO

-- =========================================================================
-- TRIGGERS
-- =========================================================================

-- Trigger: Automatically audit voucher deletions
GO
CREATE TRIGGER tr_AuditVoucherDelete
ON VoucherHeader
FOR DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO AuditTrail (CompanyID, TableName, RecordID, Action, OldValue, NewValue, UserEmail, Timestamp)
    SELECT 
        d.CompanyID,
        'VoucherHeader',
        d.VoucherID,
        'DELETE',
        (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        NULL,
        'system@seafood_erp.com',
        GETDATE()
    FROM deleted d;
END;
GO
