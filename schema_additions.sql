-- Run AFTER bank.sql (and optionally sample_data.sql)
USE BankManagement;

CREATE TABLE IF NOT EXISTS External_Transfer (
    Ext_ID INT PRIMARY KEY AUTO_INCREMENT,
    Account_ID INT NOT NULL,
    Bank_Name VARCHAR(100) NOT NULL,
    IFSC CHAR(11) NOT NULL,
    Receiver_Account_No VARCHAR(20) NOT NULL,
    Receiver_Name VARCHAR(100) NOT NULL,
    Amount DECIMAL(12,2) NOT NULL CHECK (Amount > 0),
    Reference VARCHAR(20) NOT NULL,
    Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Account_ID) REFERENCES Account(Account_ID)
);
