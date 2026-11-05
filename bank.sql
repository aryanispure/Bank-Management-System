CREATE DATABASE IF NOT EXISTS BankManagement;
USE BankManagement;

CREATE TABLE Staff (
    Staff_ID INT PRIMARY KEY AUTO_INCREMENT,
    Staff_Name VARCHAR(100) NOT NULL,
    Staff_Mobile_No CHAR(10) UNIQUE
);

CREATE TABLE Customer (
    Customer_ID INT PRIMARY KEY AUTO_INCREMENT,
    Customer_Name VARCHAR(100) NOT NULL,
    Customer_Address VARCHAR(255),
    Customer_Mobile_No CHAR(10) UNIQUE,
    Customer_Email VARCHAR(100) UNIQUE,
    DOB DATE,
    Gender VARCHAR(7) CHECK (Gender IN ('Male', 'Female', 'Other')),
    Staff_ID INT,
    FOREIGN KEY (Staff_ID) REFERENCES Staff(Staff_ID)
);

CREATE TABLE Account (
    Account_ID INT PRIMARY KEY AUTO_INCREMENT,
    Customer_ID INT NOT NULL UNIQUE,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Password_Hash VARCHAR(255) NOT NULL,
    Account_Amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (Account_Amount >= 0),
    Transaction_Limit DECIMAL(12,2) NOT NULL CHECK (Transaction_Limit > 0),
    Secure_Word VARCHAR(100),
    FOREIGN KEY (Customer_ID) REFERENCES Customer(Customer_ID)
);

CREATE TABLE Transactions (
    Transaction_ID INT PRIMARY KEY AUTO_INCREMENT,
    Account_ID INT NOT NULL,
    Transaction_Type VARCHAR(30) NOT NULL CHECK (Transaction_Type IN ('Withdraw', 'Deposit', 'Transfer')),
    Amount DECIMAL(12,2) NOT NULL CHECK (Amount > 0),
    `Date` DATE NOT NULL,
    Receiver_Account INT,
    Receiver_Name VARCHAR(100),
    FOREIGN KEY (Account_ID) REFERENCES Account(Account_ID),
    FOREIGN KEY (Receiver_Account) REFERENCES Account(Account_ID)
);

CREATE TABLE Payment (
    Payment_ID INT PRIMARY KEY AUTO_INCREMENT,
    Account_ID INT NOT NULL,
    Payment_Type VARCHAR(50),
    Payment_Amount DECIMAL(12,2) NOT NULL,
    Biller_Name VARCHAR(100),
    Biller_Amount DECIMAL(12,2),
    FOREIGN KEY (Account_ID) REFERENCES Account(Account_ID),
    CHECK (Payment_Amount > 0)
);
  